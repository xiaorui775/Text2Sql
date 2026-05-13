import type { LLMConfig } from '@/lib/types'
import { callLLM, getCallOptions } from '@/lib/llm'
import { getRequirementOptimizationPrompt } from '@/lib/prompts'

export async function runOptimizationStage(
  config: LLMConfig,
  requirement: string,
  startedAt: number,
  sendEvent: (event: string, data: any) => Promise<void>
): Promise<string> {
  const opts = getCallOptions('optimization', startedAt)

  if (!opts) {
    await sendEvent('stage_start', { stage: 'optimization', message: '预算不足，跳过需求优化...' })
    await sendEvent('stage_done', { stage: 'optimization', data: { optimizedRequirement: requirement } })
    return requirement
  }

  await sendEvent('stage_start', { stage: 'optimization', message: '正在提取关键信息并精炼需求...' })

  const result = await callLLM(
    config,
    getRequirementOptimizationPrompt(),
    requirement,
    false,
    'optimizedRequirement',
    opts
  )

  if (!result || typeof result.optimizedRequirement !== 'string') {
    throw new Error('需求优化阶段返回数据格式错误')
  }

  await sendEvent('stage_done', { stage: 'optimization', data: result })
  return result.optimizedRequirement
}
