import type { TableSchema, TableRelation } from './types'

export function extractBalancedJsonObject(input: string): string | null {
  const text = input.trim()
  const startIndex = text.indexOf('{')
  if (startIndex === -1) return null

  let depth = 0
  let inString = false
  let escaped = false
  const stack: string[] = []

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
        stack.pop()
      }
      continue
    }

    if (char === '"') {
      inString = true
      stack.push('"')
      continue
    }

    if (char === '{') {
      depth++
      stack.push('}')
    } else if (char === '[') {
      stack.push(']')
    } else if (char === '}') {
      depth--
      if (stack[stack.length - 1] === '}') stack.pop()
      if (depth === 0) {
        return text.slice(startIndex, i + 1)
      }
    } else if (char === ']') {
      if (stack[stack.length - 1] === ']') stack.pop()
    }
  }

  // 如果 JSON 不完整，尝试修复
  if (depth > 0) {
    let fixed = text.slice(startIndex)
    // 移除末尾的逗号
    fixed = fixed.replace(/,\s*$/, '')
    // 补全缺失的括号
    while (stack.length > 0) {
      const closer = stack.pop()
      if (closer) fixed += closer
    }
    return fixed
  }

  return null
}

export function aggressiveJsonFix(input: string): string | null {
  let text = input.trim()

  // 移除 markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

  // 提取 JSON 对象
  const extracted = extractBalancedJsonObject(text)
  if (!extracted) return null

  let fixed = extracted

  // 修复常见的 JSON 语法错误
  // 1. 移除对象/数组末尾的逗号
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1')

  // 2. 修复未闭合的字符串（在逗号或括号前）
  fixed = fixed.replace(/("[^"]*?)(\n|$)/g, (match, p1) => {
    if (!p1.endsWith('"')) return p1 + '"'
    return match
  })

  // 3. 移除注释
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '')
  fixed = fixed.replace(/\/\/.*/g, '')

  // 4. 修复中文标点
  fixed = fixed.replace(/，/g, ',')
  fixed = fixed.replace(/：/g, ':')

  return fixed
}

export function parseStructuredJsonContent(raw: string): any {
  let cleanedContent = raw.trim()

  // 移除 markdown 代码块
  const jsonBlockMatch = cleanedContent.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonBlockMatch) {
    cleanedContent = jsonBlockMatch[1]
  } else {
    const codeBlockMatch = cleanedContent.match(/```\s*([\s\S]*?)\s*```/)
    if (codeBlockMatch) {
      cleanedContent = codeBlockMatch[1]
    }
  }

  // 尝试多种修复策略
  const candidates = [
    cleanedContent,
    cleanedContent.replace(/,\s*([}\]])/g, '$1'), // 移除末尾逗号
    aggressiveJsonFix(cleanedContent) // 激进修复
  ].filter(Boolean) as string[]

  // 尝试解析每个候选
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      // 验证解析结果是否为对象
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch (e) {
      // 继续尝试下一个候选
      continue
    }
  }

  throw new Error('Failed to parse LLM response as JSON')
}

export function isSqlContentValid(sql: string): boolean {
  const normalized = sql.toUpperCase()
  if (normalized.length < 20) return false
  return /(CREATE\s+(TABLE|INDEX|SEQUENCE|VIEW)|ALTER\s+TABLE|DROP\s+TABLE)/.test(normalized)
}

// === 分批工具函数（Phase 2 新增占位，Phase 0 暂不实现） ===

/**
 * 将关键点分组，用于 Design 阶段分批生成
 */
export function splitKeyPointBatches(keyPoints: string[], maxBatchSize = 6): string[][] {
  if (keyPoints.length <= maxBatchSize) return [keyPoints]
  const batches: string[][] = []
  for (let i = 0; i < keyPoints.length; i += maxBatchSize) {
    batches.push(keyPoints.slice(i, i + maxBatchSize))
  }
  return batches
}

/**
 * 合并多批设计结果
 */
export function mergePartialDesignResults(
  parts: Array<{ tables: TableSchema[]; relations: TableRelation[] }>
): { tables: TableSchema[]; relations: TableRelation[] } {
  const tableMap = new Map<string, TableSchema>()
  const relationSet = new Set<string>()

  const tables: TableSchema[] = []
  const relations: TableRelation[] = []

  for (const part of parts) {
    for (const table of (part.tables || [])) {
      const existing = tableMap.get(table.name)
      if (!existing || table.fields.length > existing.fields.length) {
        tableMap.set(table.name, table)
      }
    }
    for (const relation of (part.relations || [])) {
      const key = `${relation.fromTable}|${relation.fromField}|${relation.toTable}|${relation.toField}|${relation.relationType}`
      if (!relationSet.has(key)) {
        relationSet.add(key)
        relations.push(relation)
      }
    }
  }

  for (const table of tableMap.values()) {
    tables.push(table)
  }

  return { tables, relations }
}

/**
 * 将表分组，用于 SQL 阶段分批生成
 */
export function splitTableGroups(
  tables: TableSchema[],
  relations: TableRelation[],
  batchSize = 6
): Array<{ tables: TableSchema[]; relations: TableRelation[] }> {
  if (tables.length <= batchSize) return [{ tables, relations }]

  const batches: Array<{ tables: TableSchema[]; relations: TableRelation[] }> = []
  for (let i = 0; i < tables.length; i += batchSize) {
    const batchTables = tables.slice(i, i + batchSize)
    const batchTableNames = new Set(batchTables.map(t => t.name))
    const batchRelations = relations.filter(
      r => batchTableNames.has(r.fromTable) && batchTableNames.has(r.toTable)
    )
    batches.push({ tables: batchTables, relations: batchRelations })
  }
  return batches
}
