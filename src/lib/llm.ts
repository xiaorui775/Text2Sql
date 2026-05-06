import type { LLMConfig, CallLLMOptions, ProviderCapabilities, AnalyzeStage } from './types'
import { parseStructuredJsonContent, isSqlContentValid } from './pipeline'
import { getJsonRepairPrompt } from './prompts'

export const ANALYZE_TOTAL_BUDGET_MS = 300000
export const HEARTBEAT_INTERVAL_MS = 12000
export const STAGE_TIMEOUT_MS: Record<AnalyzeStage, number> = {
  optimization: 45000,
  analysis: 35000,
  design: 80000,
  sql_generation: 90000,
  doc_generation: 70000
}

// 低于此剩余预算直接跳过该阶段
const MIN_VIABLE_TIMEOUT_MS = 8000

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getRemainingBudgetMs(startTime: number): number {
  return ANALYZE_TOTAL_BUDGET_MS - (Date.now() - startTime)
}

/**
 * 获取阶段调用选项。
 * 返回 null 表示剩余预算已不足以发起有意义的调用，调用方应直接使用 fallback。
 */
export function getCallOptions(stageName: AnalyzeStage, startTime: number): CallLLMOptions | null {
  const remaining = getRemainingBudgetMs(startTime)
  if (remaining <= MIN_VIABLE_TIMEOUT_MS) {
    return null
  }
  // 预留 3s 给 final_result + history 保存
  const usable = remaining - 3000
  const timeoutMs = Math.max(MIN_VIABLE_TIMEOUT_MS, Math.min(STAGE_TIMEOUT_MS[stageName], usable))
  // 预算紧张时不重试，节省时间
  const maxRetries = usable >= 25000 ? 1 : 0
  return {
    timeoutMs,
    maxRetries,
    stageName
  }
}

export function getDocCallOptions(startTime: number): CallLLMOptions | null {
  const remaining = getRemainingBudgetMs(startTime)
  if (remaining <= MIN_VIABLE_TIMEOUT_MS) return null
  const usable = remaining - 3000
  const timeoutMs = Math.max(MIN_VIABLE_TIMEOUT_MS, Math.min(45000, usable))
  return {
    timeoutMs,
    maxRetries: 0,
    stageName: 'doc_generation'
  }
}

export function shouldFallbackToNonStream(error: unknown, stageName: AnalyzeStage): boolean {
  if (stageName !== 'design' && stageName !== 'sql_generation') return false
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('failed to parse llm response as json')
    || message.includes('llm api returned empty content')
    || message.includes('llm api returned invalid json')
    || message.includes('unexpected end')
    || (stageName === 'sql_generation' && message.includes('sql结果校验失败'))
}

export function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item) {
          const text = (item as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .join('')
  }
  return ''
}

async function extractContentFromStandardResponse(response: Response): Promise<string> {
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    console.error('LLM API returned non-JSON response:', text)
    throw new Error(`LLM API returned invalid JSON: ${text.slice(0, 100)}...`)
  }
  const content = extractContentText(data?.choices?.[0]?.message?.content)
  if (!content) {
    throw new Error('LLM API returned empty content')
  }
  return content
}

async function extractContentFromStreamResponse(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error('LLM API 返回了空响应流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      buffer += decoder.decode()
    } else {
      buffer += decoder.decode(value, { stream: true })
    }

    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const eventBlock of events) {
      const dataLines = eventBlock
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())

      if (dataLines.length === 0) continue

      for (const payload of dataLines) {
        if (!payload) continue
        if (payload === '[DONE]') {
          return content.trim()
        }

        let chunk: any
        try {
          chunk = JSON.parse(payload)
        } catch (e) {
          console.warn('Failed to parse stream payload:', payload)
          continue
        }

        if (chunk?.error?.message) {
          throw new Error(chunk.error.message)
        }

        const deltaText = extractContentText(chunk?.choices?.[0]?.delta?.content)
        const messageText = extractContentText(chunk?.choices?.[0]?.message?.content)

        if (deltaText) {
          content += deltaText
        } else if (messageText) {
          const normalizedMessageText = messageText.trim()
          if (normalizedMessageText.startsWith(content.trim())) {
            content = normalizedMessageText
          } else {
            content += messageText
          }
        }
      }
    }

    if (done) break
  }

  if (!content) {
    throw new Error('LLM API returned empty content')
  }
  return content
}

export function resolveProviderCapabilities(config: LLMConfig): ProviderCapabilities {
  const provider = (config.provider || '').toLowerCase()

  // OpenAI 兼容端点均支持 JSON mode
  const jsonModeProviders = ['openai', 'deepseek', 'moonshot', 'zhipu', 'glm']
  if (jsonModeProviders.some(p => provider.includes(p))) {
    return { supportsJsonMode: true, supportsStreamWithJson: true }
  }

  // custom / 其他 provider：默认尝试，失败则降级
  return { supportsJsonMode: true, supportsStreamWithJson: true }
}

function isStructuredFormatUnsupportedError(errorText: string): boolean {
  const lower = errorText.toLowerCase()
  return lower.includes('response_format')
    || lower.includes('unsupported parameter')
    || lower.includes('json_object')
    || lower.includes('structured output')
    || lower.includes('not supported')
}

export async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userMessage: string,
  expectJson: boolean = true,
  textKey?: string,
  options: CallLLMOptions = { timeoutMs: 120000, maxRetries: 1, stageName: 'analysis' },
  retryCount: number = 0,
  forceNoJsonMode: boolean = false
): Promise<any> {
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
  const url = `${baseUrl}/chat/completions`
  const useStream = options.useStream ?? true

  const capabilities = resolveProviderCapabilities(config)
  const useJsonMode = expectJson && capabilities.supportsJsonMode && !forceNoJsonMode

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const body: Record<string, any> = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      stream: useStream,
      temperature: config.temperature,
      max_tokens: config.maxTokens
    }

    if (useJsonMode) {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()

      // JSON mode 不支持时自动降级
      if (response.status === 400 && useJsonMode && isStructuredFormatUnsupportedError(errorText)) {
        console.warn(`[${options.stageName}] Provider does not support response_format, falling back to prompt-only mode`)
        return callLLM(config, systemPrompt, userMessage, expectJson, textKey, options, retryCount, true)
      }

      if ((response.status === 429 || response.status >= 500) && retryCount < options.maxRetries) {
        const backoff = 1200 * (retryCount + 1) + Math.floor(Math.random() * 400)
        await sleep(backoff)
        return callLLM(config, systemPrompt, userMessage, expectJson, textKey, options, retryCount + 1, forceNoJsonMode)
      }
      throw new Error(`LLM API 调用失败: ${response.status} - ${errorText}`)
    }

    const content = useStream
      ? await extractContentFromStreamResponse(response)
      : await extractContentFromStandardResponse(response)

    if (!expectJson && textKey) {
        let cleanedContent = content.trim()
        cleanedContent = cleanedContent.replace(/^```[\w]*\n?/i, '')
                                       .replace(/\n?```$/i, '')
                                       .trim()
        if (textKey === 'sqlStatements' && !isSqlContentValid(cleanedContent)) {
          throw new Error('SQL结果校验失败：未检测到有效 DDL 语句')
        }
        return { [textKey]: cleanedContent }
    }

    try {
      return parseStructuredJsonContent(content)
    } catch (e) {
      const normalizedContent = content.trim()
      const parseSample = normalizedContent.slice(0, 300).replace(/\s+/g, ' ')
      console.error(`[${options.stageName}] JSON parse failed sample:`, parseSample)

      // 如果是第一次失败，尝试让 LLM 自己修复 JSON
      if (retryCount === 0 && expectJson) {
        console.log(`[${options.stageName}] Attempting JSON self-repair...`)
        const repairPrompt = getJsonRepairPrompt(normalizedContent)

        try {
          const repaired = await callLLM(
            config,
            '你是一个 JSON 格式修复专家。',
            repairPrompt,
            true,
            undefined,
            { ...options, maxRetries: 0 },
            1,
            forceNoJsonMode
          )
          return repaired
        } catch (repairError) {
          console.error(`[${options.stageName}] JSON self-repair failed:`, repairError)
          // 继续执行原有的容错逻辑
        }
      }

      // 容错处理：如果模型没有返回 JSON 而是直接返回了 SQL 代码
      if (!normalizedContent.includes('{') && (normalizedContent.toUpperCase().includes('CREATE TABLE') || normalizedContent.toUpperCase().includes('CREATE DATABASE'))) {
        return {
          sqlStatements: content.replace(/```sql/gi, '').replace(/```/g, '').replace(/^sql\n/i, '').trim()
        }
      }
      // 容错处理：如果是文档生成阶段返回了纯 Markdown
      if (!normalizedContent.includes('{') && normalizedContent.includes('#')) {
         return {
            designDocument: content.replace(/```markdown/gi, '').replace(/```/g, '').trim()
         }
      }
      throw new Error(`Failed to parse LLM response as JSON (stage: ${options.stageName})`)
    }

  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      if (retryCount < options.maxRetries) {
        const backoff = 1200 * (retryCount + 1) + Math.floor(Math.random() * 400)
        await sleep(backoff)
        return callLLM(config, systemPrompt, userMessage, expectJson, textKey, options, retryCount + 1, forceNoJsonMode)
      }
      throw new Error(`阶段 ${options.stageName} 调用超时（${Math.floor(options.timeoutMs / 1000)}秒），请重试或简化需求`)
    }
    if (error instanceof Error && retryCount < options.maxRetries) {
      const causeCode = (error as Error & { cause?: { code?: string } }).cause?.code
      const lowerMessage = error.message.toLowerCase()
      const isRetryableNetworkError = causeCode === 'UND_ERR_CONNECT_TIMEOUT'
        || lowerMessage.includes('fetch failed')
        || lowerMessage.includes('network')
        || lowerMessage.includes('connect timeout')
      const isRetryableParseError = lowerMessage.includes('failed to parse llm response as json')
      const isRetryableSqlValidationError = options.stageName === 'sql_generation' && lowerMessage.includes('sql结果校验失败')
      if (isRetryableNetworkError) {
        const backoff = 1200 * (retryCount + 1) + Math.floor(Math.random() * 400)
        await sleep(backoff)
        return callLLM(config, systemPrompt, userMessage, expectJson, textKey, options, retryCount + 1, forceNoJsonMode)
      }
      if (isRetryableParseError) {
        const backoff = 800 * (retryCount + 1) + Math.floor(Math.random() * 300)
        await sleep(backoff)
        return callLLM(config, systemPrompt, userMessage, expectJson, textKey, options, retryCount + 1, forceNoJsonMode)
      }
      if (isRetryableSqlValidationError) {
        const backoff = 800 * (retryCount + 1) + Math.floor(Math.random() * 300)
        await sleep(backoff)
        return callLLM(config, systemPrompt, userMessage, expectJson, textKey, options, retryCount + 1, forceNoJsonMode)
      }
    }
    throw error
  }
}
