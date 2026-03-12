import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - 获取 LLM 配置
export async function GET() {
  try {
    const config = await db.lLMConfig.findFirst({
      where: { isActive: true }
    })

    if (!config) {
      // 返回默认配置模板
      return NextResponse.json({
        exists: false,
        config: {
          provider: 'openai',
          apiKey: '',
          baseUrl: '',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 4096,
          databaseType: 'mysql'
        }
      })
    }

    // 不返回完整的 API Key，只返回掩码版本
    const maskedApiKey = config.apiKey 
      ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}`
      : ''

    return NextResponse.json({
      exists: true,
      config: {
        id: config.id,
        provider: config.provider,
        apiKey: maskedApiKey,
        hasApiKey: !!config.apiKey,
        baseUrl: config.baseUrl || '',
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        databaseType: config.databaseType || 'mysql'
      }
    })
  } catch (error) {
    console.error('Failed to get LLM config:', error)
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    )
  }
}

// PUT - 保存 LLM 配置
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, apiKey, baseUrl, model, temperature, maxTokens, databaseType, keepExistingKey } = body

    // 检查是否已有配置
    const existingConfig = await db.lLMConfig.findFirst()

    // 验证必填字段
    if (!existingConfig && (!apiKey || apiKey.trim() === '')) {
      return NextResponse.json(
        { error: 'API Key 不能为空' },
        { status: 400 }
      )
    }

    // 如果不保留现有 key 且没有提供新 key
    if (existingConfig && !keepExistingKey && (!apiKey || apiKey.trim() === '')) {
      return NextResponse.json(
        { error: 'API Key 不能为空' },
        { status: 400 }
      )
    }

    let config
    if (existingConfig) {
      // 更新现有配置
      const updateData: Record<string, unknown> = {
        provider: provider || 'openai',
        baseUrl: baseUrl || null,
        model: model || 'gpt-4o-mini',
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
        databaseType: databaseType || 'mysql'
      }
      
      // 如果提供了新的 API Key，则更新
      if (apiKey && apiKey.trim() !== '') {
        updateData.apiKey = apiKey.trim()
      }
      
      config = await db.lLMConfig.update({
        where: { id: existingConfig.id },
        data: updateData
      })
    } else {
      // 创建新配置
      config = await db.lLMConfig.create({
        data: {
          name: 'default',
          provider: provider || 'openai',
          apiKey: apiKey.trim(),
          baseUrl: baseUrl || null,
          model: model || 'gpt-4o-mini',
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens ?? 4096,
          databaseType: databaseType || 'mysql',
          isActive: true
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: '配置保存成功',
      config: {
        id: config.id,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        databaseType: config.databaseType
      }
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
