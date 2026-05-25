import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import type { LLMConfig, AnalyzeStage } from '@/lib/types'
import { callLLM, getCallOptions, getDocCallOptions, shouldFallbackToNonStream, getRemainingBudgetMs, HEARTBEAT_INTERVAL_MS } from '@/lib/llm'
import {
  getRequirementOptimizationPrompt,
  getAnalysisPrompt,
  getSchemaDesignPrompt,
  getSqlGenerationPrompt,
  getDocumentGenerationPrompt,
  getDocumentRepairPrompt,
  getDocOverviewPrompt,
  getDocDictionaryPrompt,
  getDocRelationsPrompt
} from '@/lib/prompts'
import {
  splitKeyPointBatches,
  mergePartialDesignResults,
  splitTableGroups
} from '@/lib/pipeline'
import {
  buildCompactDocInput,
  buildFallbackDesignDocument,
  isDocumentStructured,
  hasAllTablesCovered,
  shouldChunkDoc,
  splitDocTableBatches,
  buildOverviewDocInput,
  buildDictionaryDocInput,
  buildRelationsDocInput,
  assembleChunkedDoc,
  buildDictionaryTemplate,
  buildRelationsTemplate
} from '@/lib/doc'

// Allow for longer timeouts
export const maxDuration = 300 // 5 minutes

export async function POST(request: NextRequest) {
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  try {
    const body = await request.json()
    const { requirement, options } = body
    const toBool = (v: unknown, fb: boolean) => {
      if (typeof v === 'boolean') return v
      if (typeof v === 'string') { const n = v.trim().toLowerCase(); if (n === 'true') return true; if (n === 'false') return false }
      return fb
    }
    const enableOptimization = toBool(options?.enableOptimization, true)
    const enableDocGeneration = toBool(options?.enableDocGeneration, true)

    if (!requirement || typeof requirement !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的需求描述' },
        { status: 400 }
      )
    }

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

    // Check cache
    const shouldUseCache = enableOptimization && enableDocGeneration
    const cachedHistory = shouldUseCache
      ? await db.history.findFirst({
          where: {
            question: requirement,
            status: 'success',
            databaseType: llmConfig.databaseType || 'mysql',
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      : null

    if (cachedHistory) {
        const cachedResult = JSON.parse(cachedHistory.result)

        const stream = new TransformStream()
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()

        ;(async () => {
            await writer.write(encoder.encode(`event: final_result\ndata: ${JSON.stringify(cachedResult)}\n\n`))
            await writer.close()
        })()

        return new NextResponse(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
        })
    }

    const stream = new TransformStream()
    writer = stream.writable.getWriter()
    const encoder = new TextEncoder()

    const sendEvent = async (event: string, data: any) => {
        await writer!.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    }

    const withStageHeartbeat = async <T>(stage: AnalyzeStage, fn: () => Promise<T>): Promise<T> => {
        const timer = setInterval(() => {
            void sendEvent('heartbeat', { stage, timestamp: Date.now() })
        }, HEARTBEAT_INTERVAL_MS)
        try {
            return await fn()
        } finally {
            clearInterval(timer)
        }
    }

    // Start processing in background
    ;(async () => {
        let currentStage: AnalyzeStage = 'optimization'
        try {
            const config: LLMConfig = {
                provider: llmConfig.provider,
                apiKey: decrypt(llmConfig.apiKey),
                baseUrl: llmConfig.baseUrl,
                model: llmConfig.model,
                temperature: llmConfig.temperature,
                maxTokens: llmConfig.maxTokens,
                databaseType: llmConfig.databaseType || 'mysql'
            }
            const startedAt = Date.now()

            // Stage 1: Requirement Optimization
            currentStage = 'optimization'
            let optimizedRequirement = requirement;
            let optimizationResult: any = { optimizedRequirement: requirement };

            if (enableOptimization) {
                const optimizationOpts = getCallOptions('optimization', startedAt)
                if (!optimizationOpts) {
                    await sendEvent('stage_start', { stage: 'optimization', message: '预算不足，跳过需求优化...' })
                    await sendEvent('stage_done', { stage: 'optimization', data: optimizationResult })
                } else {
                    await sendEvent('stage_start', { stage: 'optimization', message: '正在提取关键信息并精炼需求...' })
                    optimizationResult = await withStageHeartbeat('optimization', () =>
                      callLLM(config, getRequirementOptimizationPrompt(), requirement, false, 'optimizedRequirement', optimizationOpts)
                    )
                    if (!optimizationResult || typeof optimizationResult.optimizedRequirement !== 'string') {
                        throw new Error('需求优化阶段返回数据格式错误')
                    }
                    await sendEvent('stage_done', { stage: 'optimization', data: optimizationResult })
                    optimizedRequirement = optimizationResult.optimizedRequirement;
                }
            } else {
                await sendEvent('stage_start', { stage: 'optimization', message: '需求优化已关闭，跳过该阶段...' })
                await sendEvent('stage_done', { stage: 'optimization', data: optimizationResult })
            }

            // Stage 2: Requirement Analysis
            currentStage = 'analysis'
            const analysisOpts = getCallOptions('analysis', startedAt)
            if (!analysisOpts) throw new Error('分析总耗时已接近上限，请简化需求后重试')
            await sendEvent('stage_start', { stage: 'analysis', message: '正在提取核心关键点...' })
            const analysisResult = await withStageHeartbeat('analysis', () =>
              callLLM(config, getAnalysisPrompt(), optimizedRequirement, true, undefined, analysisOpts)
            )
            if (!analysisResult || !Array.isArray(analysisResult.keyPoints)) {
                throw new Error('需求分析阶段返回数据格式错误')
            }
            await sendEvent('stage_done', { stage: 'analysis', data: analysisResult })

            // Stage 3: Schema Design
            currentStage = 'design'
            const designOptions = getCallOptions('design', startedAt)
            if (!designOptions) throw new Error('分析总耗时已接近上限，请简化需求后重试')
            await sendEvent('stage_start', { stage: 'design', message: '正在设计表结构...' })
            let schemaResult: any

            const designBatches = splitKeyPointBatches(analysisResult.keyPoints)
            const useChunkedDesign = designBatches.length > 1

            if (useChunkedDesign) {
                const batchResults: any[] = []
                for (let i = 0; i < designBatches.length; i++) {
                    const batchOpts = getCallOptions('design', startedAt)
                    if (!batchOpts) break
                    await sendEvent('stage_progress', { stage: 'design', progress: { completed: i, total: designBatches.length } })
                    try {
                        const batchResult = await withStageHeartbeat('design', () =>
                          callLLM(config, getSchemaDesignPrompt(config.databaseType, designBatches[i]), JSON.stringify({ keyPoints: designBatches[i] }), true, undefined, { ...batchOpts, useStream: true })
                        )
                        if (batchResult && Array.isArray(batchResult.tables)) {
                            batchResults.push(batchResult)
                        }
                    } catch (batchError) {
                        if (!shouldFallbackToNonStream(batchError, 'design')) {
                            throw batchError
                        }
                        const fallbackOpts = getCallOptions('design', startedAt)
                        if (fallbackOpts) {
                            const batchResult = await withStageHeartbeat('design', () =>
                              callLLM(config, getSchemaDesignPrompt(config.databaseType, designBatches[i]), JSON.stringify({ keyPoints: designBatches[i] }), true, undefined, { ...fallbackOpts, useStream: false, maxRetries: 0 })
                            )
                            if (batchResult && Array.isArray(batchResult.tables)) {
                                batchResults.push(batchResult)
                            }
                        }
                    }
                }

                if (batchResults.length === 0) {
                    throw new Error('表结构设计阶段返回数据格式错误')
                }

                schemaResult = mergePartialDesignResults(batchResults)
            } else {
                try {
                    schemaResult = await withStageHeartbeat('design', () =>
                      callLLM(config, getSchemaDesignPrompt(config.databaseType, analysisResult.keyPoints), JSON.stringify(analysisResult), true, undefined, { ...designOptions, useStream: true })
                    )
                } catch (error) {
                    if (!shouldFallbackToNonStream(error, 'design')) {
                        throw error
                    }
                    schemaResult = await withStageHeartbeat('design', () =>
                      callLLM(config, getSchemaDesignPrompt(config.databaseType, analysisResult.keyPoints), JSON.stringify(analysisResult), true, undefined, { ...designOptions, useStream: false, maxRetries: 0 })
                    )
                }
            }

            if (!schemaResult || typeof schemaResult !== 'object') {
                throw new Error('表结构设计阶段返回数据格式错误')
            }
            if (!Array.isArray(schemaResult.tables)) {
                schemaResult.tables = []
            }
            if (!Array.isArray(schemaResult.relations)) {
                schemaResult.relations = []
            }
            if (schemaResult.tables.length === 0) {
                throw new Error('表结构设计阶段返回数据格式错误: 缺少表数据')
            }
            await sendEvent('stage_done', { stage: 'design', data: schemaResult })

            // Stage 4: SQL Generation
            currentStage = 'sql_generation'
            const sqlOptions = getCallOptions('sql_generation', startedAt)
            let sqlGenerationResult: any

            if (!sqlOptions) {
                // 预算不足，直接用模板生成 SQL
                const fallbackSql = schemaResult.tables.map((t: any) =>
                  `CREATE TABLE ${t.name} (\n${(t.fields || []).map((f: any) =>
                    `  ${f.name} ${f.type}${f.isPrimary ? ' PRIMARY KEY' : ''}${f.isNullable ? '' : ' NOT NULL'}${f.comment ? ` -- ${f.comment}` : ''}`
                  ).join(',\n')}\n);`
                ).join('\n\n')
                sqlGenerationResult = { sqlStatements: fallbackSql }
                await sendEvent('stage_start', { stage: 'sql_generation', message: '预算不足，使用模板生成 SQL...' })
                await sendEvent('stage_done', { stage: 'sql_generation', data: sqlGenerationResult, partial: true, error: '预算不足，SQL 由模板生成' })
            } else {
            await sendEvent('stage_start', { stage: 'sql_generation', message: '正在生成 SQL 语句...' })

            const sqlBatches = splitTableGroups(schemaResult.tables, schemaResult.relations)
            const useChunkedSql = sqlBatches.length > 1

            if (useChunkedSql) {
                const batchSqlStatements: string[] = []
                for (let i = 0; i < sqlBatches.length; i++) {
                    const batchSqlOpts = getCallOptions('sql_generation', startedAt)
                    if (!batchSqlOpts) {
                        // 预算耗尽，剩余批次用模板
                        for (let j = i; j < sqlBatches.length; j++) {
                            batchSqlStatements.push(`-- [fallback] 批次 ${j + 1} 由模板生成（预算不足）\n${sqlBatches[j].tables.map(t =>
                              `CREATE TABLE ${t.name} (\n${(t.fields || []).map(f =>
                                `  ${f.name} ${f.type}${f.isPrimary ? ' PRIMARY KEY' : ''}${f.isNullable ? '' : ' NOT NULL'}${f.comment ? ` -- ${f.comment}` : ''}`
                              ).join(',\n')}\n);`
                            ).join('\n\n')}`)
                        }
                        break
                    }
                    await sendEvent('stage_progress', { stage: 'sql_generation', progress: { completed: i, total: sqlBatches.length } })
                    try {
                        const batchResult = await withStageHeartbeat('sql_generation', () =>
                          callLLM(config, getSqlGenerationPrompt(config.databaseType, sqlBatches[i].tables, sqlBatches[i].relations), JSON.stringify(sqlBatches[i]), false, 'sqlStatements', { ...batchSqlOpts, useStream: true })
                        )
                        if (batchResult && typeof batchResult.sqlStatements === 'string') {
                            batchSqlStatements.push(batchResult.sqlStatements)
                        }
                    } catch (batchError) {
                        if (!shouldFallbackToNonStream(batchError, 'sql_generation')) {
                            throw batchError
                        }
                        console.warn(`[sql_generation] batch ${i} stream failed, fallback to non-stream:`, batchError instanceof Error ? batchError.message : String(batchError))
                        const nonStreamOpts = getCallOptions('sql_generation', startedAt)
                        if (nonStreamOpts) {
                            try {
                                const batchResult = await withStageHeartbeat('sql_generation', () =>
                                  callLLM(config, getSqlGenerationPrompt(config.databaseType, sqlBatches[i].tables, sqlBatches[i].relations), JSON.stringify(sqlBatches[i]), false, 'sqlStatements', { ...nonStreamOpts, useStream: false, maxRetries: 0 })
                                )
                                if (batchResult && typeof batchResult.sqlStatements === 'string') {
                                    batchSqlStatements.push(batchResult.sqlStatements)
                                }
                            } catch (fallbackError) {
                                console.warn(`[sql_generation] batch ${i} non-stream also failed, using template fallback`)
                                batchSqlStatements.push(`-- [fallback] 批次 ${i + 1} 由模板生成\n${sqlBatches[i].tables.map(t =>
                                  `CREATE TABLE ${t.name} (\n${(t.fields || []).map(f =>
                                    `  ${f.name} ${f.type}${f.isPrimary ? ' PRIMARY KEY' : ''}${f.isNullable ? '' : ' NOT NULL'}${f.comment ? ` -- ${f.comment}` : ''}`
                                  ).join(',\n')}\n);`
                                ).join('\n\n')}`)
                            }
                        } else {
                            batchSqlStatements.push(`-- [fallback] 批次 ${i + 1} 由模板生成（预算不足）\n${sqlBatches[i].tables.map(t =>
                              `CREATE TABLE ${t.name} (\n${(t.fields || []).map(f =>
                                `  ${f.name} ${f.type}${f.isPrimary ? ' PRIMARY KEY' : ''}${f.isNullable ? '' : ' NOT NULL'}${f.comment ? ` -- ${f.comment}` : ''}`
                              ).join(',\n')}\n);`
                            ).join('\n\n')}`)
                        }
                    }
                }

                sqlGenerationResult = { sqlStatements: batchSqlStatements.join('\n\n') }
            } else {
                try {
                    sqlGenerationResult = await withStageHeartbeat('sql_generation', () =>
                      callLLM(config, getSqlGenerationPrompt(config.databaseType, schemaResult.tables, schemaResult.relations), JSON.stringify(schemaResult), false, 'sqlStatements', { ...sqlOptions, useStream: true })
                    )
                } catch (error) {
                    if (!shouldFallbackToNonStream(error, 'sql_generation')) {
                        throw error
                    }
                    console.warn('[sql_generation] stream failed, fallback to non-stream:', error instanceof Error ? error.message : String(error))
                    const nonStreamOpts = getCallOptions('sql_generation', startedAt)
                    if (nonStreamOpts) {
                        sqlGenerationResult = await withStageHeartbeat('sql_generation', () =>
                          callLLM(config, getSqlGenerationPrompt(config.databaseType, schemaResult.tables, schemaResult.relations), JSON.stringify(schemaResult), false, 'sqlStatements', { ...nonStreamOpts, useStream: false, maxRetries: 0 })
                        )
                    } else {
                        // 预算不足，用模板
                        const fallbackSql = schemaResult.tables.map((t: any) =>
                          `CREATE TABLE ${t.name} (\n${(t.fields || []).map((f: any) =>
                            `  ${f.name} ${f.type}${f.isPrimary ? ' PRIMARY KEY' : ''}${f.isNullable ? '' : ' NOT NULL'}${f.comment ? ` -- ${f.comment}` : ''}`
                          ).join(',\n')}\n);`
                        ).join('\n\n')
                        sqlGenerationResult = { sqlStatements: fallbackSql }
                    }
                }
            }
            }

            if (!sqlGenerationResult || typeof sqlGenerationResult.sqlStatements !== 'string') {
                 throw new Error('SQL生成阶段返回数据格式错误')
            }
            await sendEvent('stage_done', { stage: 'sql_generation', data: sqlGenerationResult })

            // Stage 5: Documentation Generation
            currentStage = 'doc_generation'
            let docGenerationResult: { designDocument: string } = { designDocument: '' }

            if (enableDocGeneration) {
                await sendEvent('stage_start', { stage: 'doc_generation', message: '正在生成设计文档...' })

                const fallbackDoc = () => buildFallbackDesignDocument(config.databaseType, schemaResult.tables, schemaResult.relations)

                if (shouldChunkDoc(schemaResult.tables)) {
                    // === 分段生成（大型系统 >8 表） ===
                    const docBatches = splitDocTableBatches(schemaResult.tables)
                    const totalParts = 1 + docBatches.length + 1 // PartA + PartBs + PartC
                    let partIndex = 0

                    // Part A: 概览 + 实体清单
                    const partAOptions = getDocCallOptions(startedAt)
                    if (!partAOptions) {
                        docGenerationResult = {
                            designDocument: `# 设计文档未完整生成\n\n原因：预算不足，已跳过大模型文档生成并返回兜底文档\n\n${fallbackDoc()}`
                        }
                        await sendEvent('stage_done', { stage: 'doc_generation', data: docGenerationResult, partial: true, error: '预算不足' })
                    } else {
                        let overviewResult: string
                        try {
                            const overviewInput = buildOverviewDocInput(
                                schemaResult.tables, schemaResult.relations,
                                requirement, optimizationResult.optimizedRequirement
                            )
                            const overviewResponse = await withStageHeartbeat('doc_generation', () =>
                              callLLM(config, getDocOverviewPrompt(config.databaseType, schemaResult.tables.length), overviewInput, false, 'designDocument', partAOptions)
                            )
                            overviewResult = typeof overviewResponse?.designDocument === 'string'
                              ? overviewResponse.designDocument.trim()
                              : ''
                            if (!overviewResult) throw new Error('概览生成返回空内容')
                        } catch (error) {
                            console.warn('[doc_generation] Part A failed, using template overview:', error instanceof Error ? error.message : String(error))
                            overviewResult = `# 数据库设计文档\n\n## 1. 设计概览\n本设计基于业务需求，共生成 ${schemaResult.tables.length} 张数据表、${schemaResult.relations.length} 组表关系，覆盖核心业务实体及关联关系建模。`
                        }
                        partIndex++
                        await sendEvent('stage_progress', { stage: 'doc_generation', progress: { completed: partIndex, total: totalParts } })

                        // Part B: 数据字典分批
                        const dictionaryParts: string[] = []
                        for (let i = 0; i < docBatches.length; i++) {
                            const batchOpts = getDocCallOptions(startedAt)
                            if (!batchOpts) {
                                for (let j = i; j < docBatches.length; j++) {
                                    dictionaryParts.push(buildDictionaryTemplate(docBatches[j]))
                                }
                                break
                            }
                            try {
                                const dictInput = buildDictionaryDocInput(docBatches[i])
                                const dictResponse = await withStageHeartbeat('doc_generation', () =>
                                  callLLM(config, getDocDictionaryPrompt(config.databaseType, i, docBatches.length), dictInput, false, 'designDocument', batchOpts)
                                )
                                const dictContent = typeof dictResponse?.designDocument === 'string'
                                  ? dictResponse.designDocument.trim()
                                  : ''
                                if (!dictContent) throw new Error('数据字典批次返回空内容')
                                dictionaryParts.push(dictContent)
                            } catch (error) {
                                console.warn(`[doc_generation] Part B batch ${i + 1} failed, using template:`, error instanceof Error ? error.message : String(error))
                                dictionaryParts.push(buildDictionaryTemplate(docBatches[i]))
                            }
                            partIndex++
                            await sendEvent('stage_progress', { stage: 'doc_generation', progress: { completed: partIndex, total: totalParts } })
                        }

                        // Part C: 关系说明 + 可选建议章节
                        let relationsResult: string
                        const partCOptions = getDocCallOptions(startedAt)
                        if (!partCOptions) {
                            relationsResult = buildRelationsTemplate(schemaResult.relations)
                        } else {
                            try {
                                const tableNames = schemaResult.tables.map((t: any) => t.name)
                                const relInput = buildRelationsDocInput(schemaResult.relations, tableNames)
                                const relResponse = await withStageHeartbeat('doc_generation', () =>
                                  callLLM(config, getDocRelationsPrompt(config.databaseType, schemaResult.tables.length), relInput, false, 'designDocument', partCOptions)
                                )
                                relationsResult = typeof relResponse?.designDocument === 'string'
                                  ? relResponse.designDocument.trim()
                                  : ''
                                if (!relationsResult) throw new Error('关系说明生成返回空内容')
                            } catch (error) {
                                console.warn('[doc_generation] Part C failed, using template:', error instanceof Error ? error.message : String(error))
                                relationsResult = buildRelationsTemplate(schemaResult.relations)
                            }
                        }
                        partIndex++
                        await sendEvent('stage_progress', { stage: 'doc_generation', progress: { completed: partIndex, total: totalParts } })

                        // 组装 + 校验完整性
                        const assembledDoc = assembleChunkedDoc(overviewResult, dictionaryParts, relationsResult, schemaResult.tables)
                        if (!hasAllTablesCovered(assembledDoc, schemaResult.tables)) {
                            // 最终兜底：用完整模板补齐
                            docGenerationResult = { designDocument: fallbackDoc() }
                        } else {
                            docGenerationResult = { designDocument: assembledDoc }
                        }
                        await sendEvent('stage_done', { stage: 'doc_generation', data: docGenerationResult })
                    }
                } else {
                    // === 小规模（≤8 表）：走原有单次调用逻辑 ===
                    try {
                        const docOptions = getDocCallOptions(startedAt)
                        if (!docOptions) {
                            const message = '剩余预算不足，已跳过大模型文档生成并返回兜底文档'
                            docGenerationResult = {
                                designDocument: `# 设计文档未完整生成\n\n原因：${message}\n\n以下为模板化兜底文档：\n\n${fallbackDoc()}`
                            }
                            await sendEvent('stage_done', { stage: 'doc_generation', data: docGenerationResult, partial: true, error: message })
                        } else {
                            const compactDocInput = buildCompactDocInput(schemaResult.tables, schemaResult.relations, requirement, optimizationResult.optimizedRequirement)
                            docGenerationResult = await withStageHeartbeat('doc_generation', () =>
                              callLLM(config, getDocumentGenerationPrompt(schemaResult.tables, schemaResult.relations), compactDocInput, false, 'designDocument', docOptions)
                            )
                            if (!docGenerationResult || typeof docGenerationResult.designDocument !== 'string') {
                                throw new Error('文档生成阶段返回数据格式错误')
                            }
                            const docIsStructured = isDocumentStructured(docGenerationResult.designDocument)
                            const docHasAllTables = hasAllTablesCovered(docGenerationResult.designDocument, schemaResult.tables)
                            if (!docIsStructured || !docHasAllTables) {
                                const repairOptions = getDocCallOptions(startedAt)
                                if (repairOptions && getRemainingBudgetMs(startedAt) > 18000) {
                                    const repaired = await withStageHeartbeat('doc_generation', () =>
                                      callLLM(config, getDocumentRepairPrompt(docGenerationResult.designDocument), '', false, 'designDocument', repairOptions)
                                    )
                                    if (repaired && typeof repaired.designDocument === 'string' && isDocumentStructured(repaired.designDocument) && hasAllTablesCovered(repaired.designDocument, schemaResult.tables)) {
                                        docGenerationResult = repaired
                                    } else {
                                        docGenerationResult = { designDocument: fallbackDoc() }
                                    }
                                } else {
                                    docGenerationResult = { designDocument: fallbackDoc() }
                                }
                            }
                            await sendEvent('stage_done', { stage: 'doc_generation', data: docGenerationResult })
                        }
                    } catch (error) {
                        const message = error instanceof Error ? error.message : '文档生成超时'
                        docGenerationResult = {
                            designDocument: `# 设计文档未完整生成\n\n原因：${message}\n\n以下为模板化兜底文档：\n\n${fallbackDoc()}`
                        }
                        await sendEvent('stage_done', { stage: 'doc_generation', data: docGenerationResult, partial: true, error: message })
                    }
                }
            } else {
                await sendEvent('stage_start', { stage: 'doc_generation', message: '跳过生成设计文档...' })
                await sendEvent('stage_done', { stage: 'doc_generation', data: docGenerationResult })
            }

            // Combine results
            const finalResult = {
                optimizedRequirement: optimizationResult.optimizedRequirement,
                keyPoints: analysisResult.keyPoints,
                tables: schemaResult.tables,
                relations: schemaResult.relations,
                sqlStatements: sqlGenerationResult.sqlStatements,
                designDocument: docGenerationResult.designDocument,
                databaseType: config.databaseType
            }

            // Save history
            await db.history.create({
                data: {
                    question: requirement,
                    result: JSON.stringify(finalResult),
                    databaseType: config.databaseType,
                    provider: config.provider,
                    model: config.model,
                    status: 'success'
                }
            })

            await sendEvent('final_result', finalResult)
        } catch (error) {
            console.error('Streaming error:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            const errorReason = errorMessage.toLowerCase().includes('failed to parse llm response as json')
              ? 'json_parse_failed'
              : errorMessage.includes('超时')
                ? 'timeout'
                : errorMessage.includes('校验失败')
                  ? 'validation_failed'
                  : 'unknown'
            await sendEvent('error', { message: errorMessage, stage: currentStage, reason: errorReason })
        } finally {
            await writer!.close()
        }
    })()

    return new NextResponse(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    })

  } catch (error) {
    console.error('Request error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
