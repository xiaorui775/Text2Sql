import type { TableSchema, TableRelation, TableField } from './types'

export interface ParseResult {
  success: boolean
  tables: TableSchema[]
  relations: TableRelation[]
  errors: string[]
}

/**
 * 解析 SQL DDL，提取表结构和关系
 */
export function parseSqlDdl(sql: string, existingRelations?: TableRelation[]): ParseResult {
  const errors: string[] = []
  const tables: TableSchema[] = []
  const relations: TableRelation[] = []

  if (!sql || !sql.trim()) {
    return { success: false, tables: [], relations: [], errors: ['SQL 为空'] }
  }

  // 预处理：去除 markdown 代码围栏
  let cleaned = sql.replace(/```sql\s*/gi, '').replace(/```\s*/g, '').trim()

  // 提取 COMMENT ON TABLE / COMMENT ON COLUMN（PostgreSQL/Oracle 风格）
  const pgComments = extractPgComments(cleaned)

  // 提取所有 CREATE TABLE 块
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"[\]]?(\w+)[`"\]]?)\s*\(([\s\S]*?)\)\s*[^;]*(?:;|$)/gi
  let match: RegExpExecArray | null

  while ((match = tableRegex.exec(cleaned)) !== null) {
    const tableName = match[1]
    const body = match[2]
    const fullMatch = match[0]

    try {
      const tableComment = extractTableComment(fullMatch, tableName, pgComments)
      const { fields, tableRelations, tableErrors } = parseTableBody(tableName, body, pgComments)

      if (fields.length === 0) {
        errors.push(`表 ${tableName}: 未解析到任何字段`)
        continue
      }

      tables.push({ name: tableName, comment: tableComment, fields })
      relations.push(...tableRelations)
      errors.push(...tableErrors)
    } catch (e) {
      errors.push(`表 ${tableName}: 解析失败 - ${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  // 隐式关系推断（{table}_id 启发式）
  const inferredRelations = inferRelations(tables, relations)
  relations.push(...inferredRelations)

  // 保留原有关系的 relationType
  const finalRelations = preserveRelationTypes(relations, existingRelations)

  return {
    success: tables.length > 0,
    tables,
    relations: deduplicateRelations(finalRelations),
    errors
  }
}

function extractTableComment(fullMatch: string, tableName: string, pgComments: Map<string, string>): string {
  // MySQL/MariaDB/ClickHouse: COMMENT='...' 或 COMMENT '...'
  const mysqlMatch = fullMatch.match(/COMMENT\s*=?\s*'([^']*)'/i)
  if (mysqlMatch) return mysqlMatch[1]

  // PostgreSQL/Oracle: COMMENT ON TABLE
  const pgKey = tableName.toLowerCase()
  return pgComments.get(pgKey) || ''
}

/** 提取 PostgreSQL 风格的 COMMENT ON 语句 */
function extractPgComments(sql: string): Map<string, string> {
  const comments = new Map<string, string>()
  const regex = /COMMENT\s+ON\s+(TABLE|COLUMN)\s+(?:[`"[\]]?(\w+)[`"\]]?\.)?(?:[`"[\]]?(\w+)[`"\]]?)(?:\.[`"[\]]?(\w+)[`"\]]?)?\s+IS\s+'([^']*)'/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(sql)) !== null) {
    const type = m[1].toLowerCase()
    if (type === 'table') {
      const table = (m[3] || m[2] || '').toLowerCase()
      comments.set(table, m[5])
    } else {
      // column: table.column
      const table = (m[3] || m[2] || '').toLowerCase()
      const col = (m[4] || m[3] || '').toLowerCase()
      comments.set(`${table}.${col}`, m[5])
    }
  }
  return comments
}

interface TableBodyResult {
  fields: TableField[]
  tableRelations: TableRelation[]
  tableErrors: string[]
}

function parseTableBody(tableName: string, body: string, pgComments: Map<string, string>): TableBodyResult {
  const fields: TableField[] = []
  const tableRelations: TableRelation[] = []
  const tableErrors: string[] = []

  // 按逗号分割，但要跳过括号内的逗号（如 VARCHAR(100), DECIMAL(10,2)）
  const lines = splitByComma(body)

  // 收集表级 PRIMARY KEY
  const tablePkMatch = body.match(/PRIMARY\s+KEY\s*\(\s*([^)]+)\s*\)/i)
  const tablePkColumns = tablePkMatch
    ? tablePkMatch[1].split(',').map(c => stripQuotes(c.trim()).toLowerCase())
    : []

  // 收集表级 FOREIGN KEY
  const fkRegex = /FOREIGN\s+KEY\s*\(\s*[`"[\]]?(\w+)[`"\]]?\s*\)\s*REFERENCES\s*[`"[\]]?(\w+)[`"\]]?\s*\(\s*[`"[\]]?(\w+)[`"\]]?\s*\)/gi
  let fkMatch: RegExpExecArray | null
  while ((fkMatch = fkRegex.exec(body)) !== null) {
    tableRelations.push({
      fromTable: tableName,
      fromField: fkMatch[1],
      toTable: fkMatch[2],
      toField: fkMatch[3],
      relationType: 'N:1'
    })
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 跳过表级约束
    if (/^\s*(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\s*\(|INDEX\s|KEY\s|CONSTRAINT\s|CHECK\s*\()/i.test(trimmed)) {
      continue
    }

    try {
      const field = parseColumnDef(trimmed, tableName, tablePkColumns, tableRelations, pgComments)
      if (field) fields.push(field)
    } catch {
      tableErrors.push(`表 ${tableName}: 跳过无法解析的行 - ${trimmed.slice(0, 50)}`)
    }
  }

  return { fields, tableRelations, tableErrors }
}

function parseColumnDef(
  line: string,
  tableName: string,
  tablePkColumns: string[],
  tableRelations: TableRelation[],
  pgComments: Map<string, string>
): TableField | null {
  // 匹配: `col_name` TYPE ... 或 col_name TYPE ...
  const colMatch = line.match(/^[`"[\]]?(\w+)[`"\]]?\s+(\w+(?:\([^)]*\))?)/)
  if (!colMatch) return null

  const name = colMatch[1]
  const type = colMatch[2]
  const upperLine = line.toUpperCase()

  const isPrimary = upperLine.includes('PRIMARY KEY') || tablePkColumns.includes(name.toLowerCase())
  const isNullable = !upperLine.includes('NOT NULL') && !isPrimary // PK 默认 NOT NULL
  const isForeign = tableRelations.some(r => r.fromField.toLowerCase() === name.toLowerCase())

  // COMMENT 提取
  let comment = ''
  // MySQL/ClickHouse 风格: COMMENT '...'
  const commentMatch = line.match(/COMMENT\s+'([^']*)'/i)
  if (commentMatch) {
    comment = commentMatch[1]
  } else {
    // SQLite 风格: -- 注释
    const inlineComment = line.match(/--\s*(.+)$/)
    if (inlineComment) comment = inlineComment[1].trim()
  }
  // PostgreSQL COMMENT ON COLUMN
  if (!comment) {
    const pgKey = `${tableName.toLowerCase()}.${name.toLowerCase()}`
    comment = pgComments.get(pgKey) || ''
  }

  return { name, type, isPrimary, isForeign, isNullable, comment }
}

/** 按逗号分割，跳过括号内的逗号 */
function splitByComma(body: string): string[] {
  const result: string[] = []
  let depth = 0
  let current = ''

  for (const ch of body) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      result.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) result.push(current)
  return result
}

function stripQuotes(s: string): string {
  return s.replace(/^[`"[\]]|[`"\]]$/g, '')
}

/** 隐式关系推断：{table}_id 列名启发式 */
function inferRelations(tables: TableSchema[], existingRelations: TableRelation[]): TableRelation[] {
  const tableNames = new Set(tables.map(t => t.name.toLowerCase()))
  const existingKeys = new Set(
    existingRelations.map(r => `${r.fromTable}:${r.fromField}:${r.toTable}:${r.toField}`.toLowerCase())
  )
  const inferred: TableRelation[] = []

  for (const table of tables) {
    for (const field of table.fields) {
      const fn = field.name.toLowerCase()
      // 匹配 xxx_id → 引用表 xxx
      const refMatch = fn.match(/^(.+)_id$/)
      if (!refMatch) continue
      const refTableName = refMatch[1]
      if (!tableNames.has(refTableName)) continue

      const key = `${table.name}:${field.name}:${refTableName}:id`
      if (existingKeys.has(key)) continue

      // 避免自引用（自身已有显式 FK 时不重复）
      if (table.name.toLowerCase() === refTableName) continue

      inferred.push({
        fromTable: table.name,
        fromField: field.name,
        toTable: refTableName,
        toField: 'id',
        relationType: 'N:1'
      })
    }
  }
  return inferred
}

/** 保留原有关系的 relationType（通过四元组匹配） */
function preserveRelationTypes(
  newRelations: TableRelation[],
  existingRelations?: TableRelation[]
): TableRelation[] {
  if (!existingRelations || existingRelations.length === 0) return newRelations

  const typeMap = new Map<string, string>()
  for (const r of existingRelations) {
    const key = `${r.fromTable}:${r.fromField}:${r.toTable}:${r.toField}`.toLowerCase()
    typeMap.set(key, r.relationType)
  }

  return newRelations.map(r => {
    const key = `${r.fromTable}:${r.fromField}:${r.toTable}:${r.toField}`.toLowerCase()
    const preservedType = typeMap.get(key)
    return preservedType ? { ...r, relationType: preservedType } : r
  })
}

function deduplicateRelations(relations: TableRelation[]): TableRelation[] {
  const seen = new Set<string>()
  return relations.filter(r => {
    const key = `${r.fromTable}:${r.fromField}:${r.toTable}:${r.toField}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
