export interface LLMConfig {
  provider: string
  apiKey: string
  baseUrl: string | null
  model: string
  temperature: number
  maxTokens: number
  databaseType: string
}

export type AnalyzeStage = 'optimization' | 'analysis' | 'design' | 'sql_generation' | 'doc_generation'

export interface CallLLMOptions {
  timeoutMs: number
  maxRetries: number
  stageName: AnalyzeStage
  useStream?: boolean
}

export interface ProviderCapabilities {
  supportsJsonMode: boolean
  supportsStreamWithJson: boolean
}

export interface TableField {
  name: string
  type: string
  isPrimary: boolean
  isForeign: boolean
  isNullable: boolean
  comment: string
}

export interface TableRelation {
  fromTable: string
  fromField: string
  toTable: string
  toField: string
  relationType: string
}

export interface TableSchema {
  name: string
  comment: string
  fields: TableField[]
}

export interface AnalysisResult {
  optimizedRequirement?: string
  keyPoints: string[]
  tables: TableSchema[]
  relations: TableRelation[]
  sqlStatements: string
  databaseType?: string
  designDocument?: string
}
