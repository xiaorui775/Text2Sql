import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - 获取 LLM 配置列表
export async function GET() {
  try {
    const configs = await db.lLMConfig.findMany({
      orderBy: { createdAt: 'desc' }
    })

    if (configs.length === 0) {
      return NextResponse.json({
        exists: false,
        configs: [],
        databaseType: 'mysql'
      })
    }

    // 处理配置列表，不再掩码 API Key，由前端控制显示
    const safeConfigs = configs.map(config => ({
      id: config.id,
      name: config.name || 'Default Config',
      provider: config.provider,
      apiKey: config.apiKey || '', // 返回完整 Key
      hasApiKey: !!config.apiKey,
      baseUrl: config.baseUrl || '',
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      isActive: config.isActive,
      // 数据库类型现在作为全局配置返回，这里仅保留兼容性
    }))

    // 获取当前激活配置的数据库类型，如果未激活则取第一个
    const activeConfig = configs.find(c => c.isActive) || configs[0]
    const databaseType = activeConfig.databaseType || 'mysql'

    return NextResponse.json({
      exists: true,
      configs: safeConfigs,
      databaseType: databaseType
    })
  } catch (error) {
    console.error('Failed to get LLM config:', error)
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    )
  }
}

// PUT - 保存 LLM 配置列表
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { configs, databaseType } = body

    if (!Array.isArray(configs)) {
      return NextResponse.json(
        { error: '无效的配置数据格式' },
        { status: 400 }
      )
    }

    // 开启事务处理
    await db.$transaction(async (tx) => {
      // 1. 获取现有所有配置，用于对比 API Key
      const existingConfigs = await tx.lLMConfig.findMany()
      const existingConfigMap = new Map(existingConfigs.map(c => [c.id, c]))

      // 2. 删除所有旧配置 (简单粗暴但有效，或者可以做增量更新)
      // 为了保持 ID 稳定，我们选择 update 或 create，删除不在列表中的
      
      const incomingIds = new Set(configs.map(c => c.id).filter(id => id && !id.startsWith('new-'))) // 假设前端生成 UUID

      // 删除不在新列表中的配置
      await tx.lLMConfig.deleteMany({
        where: {
          id: { notIn: Array.from(incomingIds) }
        }
      })

      // 更新或创建配置
      for (const config of configs) {
        const existing = existingConfigMap.get(config.id)
        
        // 直接使用前端传来的 apiKey，不再进行特殊掩码判断逻辑
        const apiKeyToSave = config.apiKey

        const configData = {
          name: config.name || 'Config',
          provider: config.provider || 'openai',
          apiKey: apiKeyToSave,
          baseUrl: config.baseUrl || null,
          model: config.model || 'gpt-4o-mini',
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens ?? 4096,
          isActive: config.isActive || false,
          databaseType: databaseType || 'mysql' // 将全局数据库类型保存到每个配置中，或仅保存到激活配置
        }

        if (existing) {
          await tx.lLMConfig.update({
            where: { id: config.id },
            data: configData
          })
        } else {
          await tx.lLMConfig.create({
            data: {
              ...configData,
              id: config.id // 使用前端生成的 UUID 或让 DB 生成
            }
          })
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: '配置保存成功'
    })
  } catch (error) {
    console.error('Failed to save LLM config:', error)
    return NextResponse.json(
      { 
        error: '保存配置失败',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}


// DELETE - 删除 LLM 配置
export async function DELETE() {
  try {
    await db.lLMConfig.deleteMany({})
    return NextResponse.json({ success: true, message: '配置已删除' })
  } catch (error) {
    console.error('Failed to delete LLM config:', error)
    return NextResponse.json(
      { error: '删除配置失败' },
      { status: 500 }
    )
  }
}
