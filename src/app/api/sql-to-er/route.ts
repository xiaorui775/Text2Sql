import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { callLLM } from '@/lib/llm'
import { getDocumentGenerationPrompt } from '@/lib/prompts'
import { buildCompactDocInput, buildFallbackDesignDocument } from '@/lib/doc'
import type { LLMConfig, TableSchema, TableRelation } from '@/lib/types'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tables, relations, databaseType } = body as {
      tables: TableSchema[]
      relations: TableRelation[]
      databaseType?: string
    }

    if (!Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json(
        { error: '请提供有效的表结构数据' },
        { status: 400 }
      )
    }

    const dbType = databaseType || 'mysql'

    // 获取 LLM 配置
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
      databaseType: llmConfig.databaseType || dbType
    }

    const safeRelations = Array.isArray(relations) ? relations : []

    try {
      const userInput = buildCompactDocInput(tables, safeRelations)
      const systemPrompt = getDocumentGenerationPrompt(tables, safeRelations)

      const result = await callLLM(
        config,
        systemPrompt,
        userInput,
        false,
        'designDocument',
        { timeoutMs: 60000, maxRetries: 1, stageName: 'doc_generation' }
      )

      if (result && typeof result.designDocument === 'string' && result.designDocument.trim()) {
        return NextResponse.json({ designDocument: result.designDocument })
      }

      // LLM 返回空内容，降级为模板
      const fallback = buildFallbackDesignDocument(dbType, tables, safeRelations)
      return NextResponse.json({ designDocument: fallback })
    } catch (llmError) {
      console.warn('[sql-to-er] LLM doc generation failed, using fallback:', llmError instanceof Error ? llmError.message : String(llmError))
      const fallback = buildFallbackDesignDocument(dbType, tables, safeRelations)
      return NextResponse.json({ designDocument: fallback })
    }
  } catch (error) {
    console.error('[sql-to-er] Request error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
