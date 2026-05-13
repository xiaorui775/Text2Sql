import { jsonrepair } from 'jsonrepair'
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

  // 如果 JSON 不完整，返回已提取部分
  if (depth > 0) {
    return text.slice(startIndex)
  }

  return null
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

  // 提取 JSON 对象（处理 LLM 可能返回的额外文本）
  const extracted = extractBalancedJsonObject(cleanedContent)
  const candidate = extracted || cleanedContent

  // 尝试直接解析
  try {
    const parsed = JSON.parse(candidate)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (e) {
    // 继续尝试修复
  }

  // 使用 jsonrepair 修复
  try {
    const repaired = jsonrepair(candidate)
    const parsed = JSON.parse(repaired)
    if (parsed && typeof parsed === 'object') {
      return parsed
    }
  } catch (e) {
    console.error('jsonrepair failed:', e instanceof Error ? e.message : String(e))
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
