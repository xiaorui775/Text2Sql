import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { callLLM } from '@/lib/llm'
import type { LLMConfig, TableSchema, TableRelation } from '@/lib/types'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tables } = body as { tables: TableSchema[] }

    if (!Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json(
        { error: '请提供有效的表结构数据' },
        { status: 400 }
      )
    }

    const llmConfig = await db.lLMConfig.findFirst({
      where: { isActive: true }
    })

    if (!llmConfig || !llmConfig.apiKey) {
      return NextResponse.json(
        { error: '请先配置 LLM 服务', needConfig: true },
        { status: 400 }
      )
    }

    const config: LLMConfig = {
      provider: llmConfig.provider,
      apiKey: decrypt(llmConfig.apiKey),
      baseUrl: llmConfig.baseUrl,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      databaseType: llmConfig.databaseType || 'mysql'
    }

    const systemPrompt = `你是一个数据库架构师。根据提供的数据库表结构，分析并推断表与表之间的关联关系。

分析规则：
1. 优先识别显式的外键约束（FOREIGN KEY）
2. 推断隐式外键：字段名为 {关联表名}_id 格式的，大概率是外键
3. 识别自引用关系（如 parent_id 引用同表 id）
4. 根据字段名语义推断（如 buyer_id → users 表，category_id → categories 表）
5. 多对多关系：如果存在中间关联表（如 user_roles 同时引用 users 和 roles），识别两端的一对多关系

【极度重要 - JSON 格式要求】：
1. 必须返回一个合法的 JSON 对象
2. 不要输出任何解释性文字、markdown 标记或代码块
3. 关系类型只能是 "1:1"、"1:N"、"N:1" 或 "N:M"

返回格式：
{"relations":[{"fromTable":"表名","fromField":"字段名","toTable":"关联表名","toField":"关联字段名","relationType":"N:1"}]}`

    const userInput = JSON.stringify({
      tables: tables.map(t => ({
        name: t.name,
        comment: t.comment,
        fields: t.fields.map(f => ({
          name: f.name,
          type: f.type,
          isPrimary: f.isPrimary,
          isNullable: f.isNullable,
          comment: f.comment
        }))
      }))
    })

    try {
      const result = await callLLM(
        config,
        systemPrompt,
        userInput,
        true,
        undefined,
        { timeoutMs: 30000, maxRetries: 1, stageName: 'analysis' }
      )

      if (result && Array.isArray(result.relations)) {
        // 校验返回的关系数据，过滤无效引用
        const tableNames = new Set(tables.map(t => t.name.toLowerCase()))
        const validRelations = (result.relations as TableRelation[]).filter(r =>
          r.fromTable && r.fromField && r.toTable && r.toField &&
          tableNames.has(r.fromTable.toLowerCase()) &&
          tableNames.has(r.toTable.toLowerCase())
        )
        return NextResponse.json({ relations: validRelations })
      }

      return NextResponse.json({ relations: [] })
    } catch (llmError) {
      console.warn('[sql-to-er/relations] LLM analysis failed:', llmError instanceof Error ? llmError.message : String(llmError))
      return NextResponse.json({ relations: [] })
    }
  } catch (error) {
    console.error('[sql-to-er/relations] Request error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
