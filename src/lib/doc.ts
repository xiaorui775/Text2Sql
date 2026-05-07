import type { TableSchema, TableRelation } from './types'

export function hasMarkdownTable(content: string, requiredHeaders: string[]): boolean {
  const normalized = content.replace(/\r\n/g, '\n')
  return requiredHeaders.every(header => normalized.includes(header))
}

export function isDocumentStructured(content: string): boolean {
  const normalized = content.replace(/\r\n/g, '\n')
  const requiredSections = [
    '# 数据库设计文档',
    '## 1. 设计概览',
    '## 2. 实体清单',
    '## 3. 数据字典',
    '## 4. 表关系说明'
  ]
  const hasSections = requiredSections.every(section => normalized.includes(section))
  const hasEntityTable = hasMarkdownTable(normalized, ['| 表名 | 中文名/注释 | 说明 |'])
  const hasDictionaryTable = hasMarkdownTable(normalized, ['| 字段名 | 中文名/注释 | 类型 | 主键 | 外键 | 可空 | 说明 |'])
  const hasRelationTable = hasMarkdownTable(normalized, ['| 源表 | 源字段 | 目标表 | 目标字段 | 关系类型 | 说明 |'])
  return hasSections && hasEntityTable && hasDictionaryTable && hasRelationTable
}

export function hasAllTablesCovered(content: string, tables: TableSchema[]): boolean {
  const normalized = content.replace(/\r\n/g, '\n')
  const tableNames = (Array.isArray(tables) ? tables : [])
    .map((table) => String(table?.name || '').trim())
    .filter(Boolean)
  if (tableNames.length === 0) return true
  return tableNames.every((tableName) =>
    normalized.includes(`表：${tableName}`) || normalized.includes(`| ${tableName} |`)
  )
}

export function toFlag(value: boolean): string {
  return value ? '是' : '否'
}

export function deriveTablePurpose(table: TableSchema): string {
  const tableName = String(table?.name || '').trim()
  const tableComment = String(table?.comment || '').trim()
  if (tableComment) {
    return `用于存储${tableComment}相关数据，支撑对应业务流程。`
  }
  if (tableName) {
    return `用于存储${tableName}相关数据，支撑核心业务处理。`
  }
  return '用于承载该业务实体的核心数据。'
}

export function buildCompactDocInput(
  tables: TableSchema[],
  relations: TableRelation[],
  requirement?: string,
  optimizedRequirement?: string
): string {
  let compactTables = (Array.isArray(tables) ? tables : []).slice(0, 80).map((table) => ({
    name: table?.name || '',
    comment: table?.comment || '',
    fields: (Array.isArray(table?.fields) ? table.fields : []).slice(0, 80).map((field) => ({
      name: field?.name || '',
      type: field?.type || '',
      isPrimary: !!field?.isPrimary,
      isForeign: !!field?.isForeign,
      isNullable: !!field?.isNullable,
      comment: field?.comment || ''
    }))
  }))

  let compactRelations = (Array.isArray(relations) ? relations : []).slice(0, 200).map((relation) => ({
    fromTable: relation?.fromTable || '',
    fromField: relation?.fromField || '',
    toTable: relation?.toTable || '',
    toField: relation?.toField || '',
    relationType: relation?.relationType || ''
  }))

  const payloadObj: Record<string, any> = { tables: compactTables, relations: compactRelations }

  if (requirement) {
    payloadObj.requirement = requirement.length > 2000 ? requirement.slice(0, 2000) + '...' : requirement
  }
  if (optimizedRequirement) {
    payloadObj.optimizedRequirement = optimizedRequirement.length > 2000 ? optimizedRequirement.slice(0, 2000) + '...' : optimizedRequirement
  }

  let payload = JSON.stringify(payloadObj)
  while (payload.length > 22000 && (compactTables.length > 10 || compactRelations.length > 20)) {
    if (compactTables.length >= compactRelations.length / 2 && compactTables.length > 10) {
      compactTables = compactTables.slice(0, Math.max(10, Math.floor(compactTables.length * 0.85)))
    } else if (compactRelations.length > 20) {
      compactRelations = compactRelations.slice(0, Math.max(20, Math.floor(compactRelations.length * 0.85)))
    } else {
      break
    }
    const retryObj: Record<string, any> = { tables: compactTables, relations: compactRelations }
    if (requirement) retryObj.requirement = payloadObj.requirement
    if (optimizedRequirement) retryObj.optimizedRequirement = payloadObj.optimizedRequirement
    payload = JSON.stringify(retryObj)
  }
  if (payload.length <= 22000) return payload

  const minimalObj: Record<string, any> = {
    tables: compactTables.slice(0, 10),
    relations: compactRelations.slice(0, 20)
  }
  if (requirement) minimalObj.requirement = payloadObj.requirement
  if (optimizedRequirement) minimalObj.optimizedRequirement = payloadObj.optimizedRequirement
  return JSON.stringify(minimalObj)
}

export function buildFallbackDesignDocument(databaseType: string, tables: TableSchema[], relations: TableRelation[]): string {
  const entityRows = tables.map((table) =>
    `| ${table.name || '-'} | ${table.comment || '-'} | ${deriveTablePurpose(table)} |`
  ).join('\n') || '| - | - | 用于承载该业务实体的核心数据。 |'
  const dictionarySections = tables.map((table, tableIndex: number) => {
    const header = `### 3.${tableIndex + 1} 表：${table.name || '-'}`
    const rows = (Array.isArray(table.fields) ? table.fields : []).map((field) =>
      `| ${field.name || '-'} | ${field.comment || '-'} | ${field.type || '-'} | ${toFlag(!!field.isPrimary)} | ${toFlag(!!field.isForeign)} | ${toFlag(!!field.isNullable)} | ${field.comment || '-'} |`
    ).join('\n') || '| - | - | - | - | - | - | - |'
    return `${header}
- 表作用：${deriveTablePurpose(table)}

| 字段名 | 中文名/注释 | 类型 | 主键 | 外键 | 可空 | 说明 |
|---|---|---|---|---|---|---|
${rows}`
  }).join('\n\n')

  const relationRows = relations.map((relation) =>
    `| ${relation.fromTable || '-'} | ${relation.fromField || '-'} | ${relation.toTable || '-'} | ${relation.toField || '-'} | ${relation.relationType || '-'} | - |`
  ).join('\n') || '| - | - | - | - | - | - |'

  const pkFields = tables.flatMap(t => (t.fields || []).filter(f => f.isPrimary).map(f => `${t.name}.${f.name}`))
  const fkFields = tables.flatMap(t => (t.fields || []).filter(f => f.isForeign).map(f => `${t.name}.${f.name}`))
  const auditFields = tables.some(t => (t.fields || []).some(f => f.name === 'created_at' || f.name === 'updated_at'))
  const softDeleteFields = tables.some(t => (t.fields || []).some(f => f.name === 'deleted_at' || f.name === 'is_deleted'))

  return `# 数据库设计文档

## 1. 设计概览
本设计基于业务需求，共生成 ${tables.length} 张数据表、${relations.length} 组表关系，覆盖核心业务实体及关联关系建模。

## 2. 实体清单
| 表名 | 中文名/注释 | 说明 |
|---|---|---|
${entityRows}

## 3. 数据字典
${dictionarySections}

## 4. 表关系说明
| 源表 | 源字段 | 目标表 | 目标字段 | 关系类型 | 说明 |
|---|---|---|---|---|---|
${relationRows}

## 5. 设计决策说明
- 主键策略：各表均采用单一主键字段（${pkFields.length > 0 ? pkFields.slice(0, 5).join('、') + (pkFields.length > 5 ? '等' : '') : '自增ID'}），确保数据唯一性。
- 关系设计：通过外键约束维护表间关系，外键字段采用{关联表名}_id命名规范。
${auditFields ? '- 审计字段：包含 created_at、updated_at 等时间戳字段，便于追踪数据变更。' : ''}
${softDeleteFields ? '- 软删除：部分表包含 deleted_at/is_deleted 字段，支持逻辑删除而非物理删除。' : ''}

## 6. 索引与查询建议
${fkFields.length > 0 ? `- 建议对外键字段创建索引以优化关联查询：${fkFields.slice(0, 8).join('、')}${fkFields.length > 8 ? '等' : ''}` : '- 暂无额外索引建议'}
- 主键索引已自动创建，无需额外配置

## 7. 安全与数据完整性
- 所有非空字段已设置 NOT NULL 约束
- 唯一性约束请根据业务规则在具体字段上添加（如用户名、邮箱等）
${tables.some(t => (t.fields || []).some(f => f.comment?.includes('密码') || f.name.includes('password') || f.name.includes('secret')))
  ? '- 包含敏感字段（如密码、密钥等），建议在应用层进行加密存储'
  : '- 暂未发现明显敏感字段'}

## 8. 扩展与迁移建议
- 后续如需扩展新业务模块，建议遵循现有的命名规范和主键策略
- 数据量较大时可考虑对大表进行分区或归档策略
- ${databaseType.toUpperCase()} 环境下建议定期备份并验证恢复流程
`
}

// === 分段文档生成工具（大型系统 >8 表时使用） ===

const CHUNK_DOC_BATCH_SIZE = 8

export function shouldChunkDoc(tables: TableSchema[]): boolean {
  return tables.length > CHUNK_DOC_BATCH_SIZE
}

export function splitDocTableBatches(tables: TableSchema[], batchSize = CHUNK_DOC_BATCH_SIZE): TableSchema[][] {
  if (tables.length <= batchSize) return [tables]
  const batches: TableSchema[][] = []
  for (let i = 0; i < tables.length; i += batchSize) {
    batches.push(tables.slice(i, i + batchSize))
  }
  return batches
}

/** Part A 输入：仅表名+注释+需求数，不传字段详情，payload 极小 */
export function buildOverviewDocInput(
  tables: TableSchema[],
  relations: TableRelation[],
  requirement?: string,
  optimizedRequirement?: string
): string {
  const tableSummaries = tables.map(t => ({
    name: t.name,
    comment: t.comment,
    fieldCount: Array.isArray(t.fields) ? t.fields.length : 0
  }))
  const relationSummaries = relations.map(r => ({
    fromTable: r.fromTable,
    fromField: r.fromField,
    toTable: r.toTable,
    toField: r.toField,
    relationType: r.relationType
  }))

  const payload: Record<string, any> = {
    totalTables: tables.length,
    totalRelations: relations.length,
    tables: tableSummaries,
    relations: relationSummaries
  }
  if (requirement) {
    payload.requirement = requirement.length > 3000 ? requirement.slice(0, 3000) + '...' : requirement
  }
  if (optimizedRequirement) {
    payload.optimizedRequirement = optimizedRequirement.length > 3000 ? optimizedRequirement.slice(0, 3000) + '...' : optimizedRequirement
  }
  return JSON.stringify(payload)
}

/** Part B 输入：一批表的完整字段信息 */
export function buildDictionaryDocInput(batchTables: TableSchema[]): string {
  return JSON.stringify(batchTables.map(table => ({
    name: table.name,
    comment: table.comment,
    fields: (Array.isArray(table.fields) ? table.fields : []).map(field => ({
      name: field.name,
      type: field.type,
      isPrimary: !!field.isPrimary,
      isForeign: !!field.isForeign,
      isNullable: !!field.isNullable,
      comment: field.comment
    }))
  })))
}

/** Part C 输入：关系列表 + 表名清单 */
export function buildRelationsDocInput(relations: TableRelation[], tableNames: string[]): string {
  return JSON.stringify({
    totalTables: tableNames.length,
    tableNames,
    relations: relations.map(r => ({
      fromTable: r.fromTable,
      fromField: r.fromField,
      toTable: r.toTable,
      toField: r.toField,
      relationType: r.relationType
    }))
  })
}

/** 组装分段文档，重新编号 ### 3.x，补齐缺失表 */
export function assembleChunkedDoc(
  overview: string,
  dictionaryParts: string[],
  relations: string,
  allTables: TableSchema[]
): string {
  // 拼接数据字典，重新编号 ### 3.x
  const rawDictionary = dictionaryParts.join('\n\n')
  let tableIndex = 0
  const renumberedDictionary = rawDictionary.replace(
    /###\s+\d+\.\d+\s+表：/g,
    () => `### 3.${++tableIndex} 表：`
  )
  // 兜底：如果 LLM 没带编号，直接用 ### 表： 的也尝试重新编号
  const finalDictionary = renumberedDictionary.replace(
    /###\s+表：/g,
    () => `### 3.${++tableIndex} 表：`
  )

  // 校验覆盖：检查每个表名是否出现在数据字典中
  const missingTables: TableSchema[] = []
  for (const table of allTables) {
    if (!finalDictionary.includes(`表：${table.name}`)) {
      missingTables.push(table)
    }
  }

  // 补齐缺失表
  const missingDictSections = missingTables.map(t => {
    const rows = (Array.isArray(t.fields) ? t.fields : []).map(field =>
      `| ${field.name || '-'} | ${field.comment || '-'} | ${field.type || '-'} | ${toFlag(!!field.isPrimary)} | ${toFlag(!!field.isForeign)} | ${toFlag(!!field.isNullable)} | ${field.comment || '-'} |`
    ).join('\n') || '| - | - | - | - | - | - | - |'
    return `### 3.${++tableIndex} 表：${t.name}
- 表作用：${deriveTablePurpose(t)}

| 字段名 | 中文名/注释 | 类型 | 主键 | 外键 | 可空 | 说明 |
|---|---|---|---|---|---|---|
${rows}`
  }).join('\n\n')

  const fullDictionary = finalDictionary + (missingDictSections ? '\n\n' + missingDictSections : '')

  // 清理 overview 末尾多余的换行，避免拼接时空行过多
  const cleanOverview = overview.trimEnd()
  const cleanRelations = relations.trim()

  return `${cleanOverview}

## 3. 数据字典
${fullDictionary}

${cleanRelations}`
}

/** Part B 单批模板兜底（预算耗尽/调用失败时） */
export function buildDictionaryTemplate(tables: TableSchema[]): string {
  return tables.map(table => {
    const rows = (Array.isArray(table.fields) ? table.fields : []).map(field =>
      `| ${field.name || '-'} | ${field.comment || '-'} | ${field.type || '-'} | ${toFlag(!!field.isPrimary)} | ${toFlag(!!field.isForeign)} | ${toFlag(!!field.isNullable)} | ${field.comment || '-'} |`
    ).join('\n') || '| - | - | - | - | - | - | - |'
    return `### 表：${table.name || '-'}
- 表作用：${deriveTablePurpose(table)}

| 字段名 | 中文名/注释 | 类型 | 主键 | 外键 | 可空 | 说明 |
|---|---|---|---|---|---|---|
${rows}`
  }).join('\n\n')
}

/** Part C 模板兜底 */
export function buildRelationsTemplate(relations: TableRelation[]): string {
  const relationRows = relations.map(r =>
    `| ${r.fromTable || '-'} | ${r.fromField || '-'} | ${r.toTable || '-'} | ${r.toField || '-'} | ${r.relationType || '-'} | - |`
  ).join('\n') || '| - | - | - | - | - | - |'

  return `## 4. 表关系说明
| 源表 | 源字段 | 目标表 | 目标字段 | 关系类型 | 说明 |
|---|---|---|---|---|---|
${relationRows}`
}

