import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // 单条详情查询（含 result）
    if (id) {
      const record = await db.history.findUnique({
        where: { id },
        select: {
          id: true,
          question: true,
          result: true,
          databaseType: true,
          provider: true,
          model: true,
          status: true,
          errorMessage: true,
          createdAt: true,
        }
      })
      if (!record) {
        return NextResponse.json({ error: '记录不存在' }, { status: 404 })
      }
      return NextResponse.json(record)
    }

    // 列表查询（不含 result）
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10)

    const skip = (page - 1) * pageSize

    const [history, total] = await Promise.all([
      db.history.findMany({
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: pageSize,
        select: {
          id: true,
          question: true,
          databaseType: true,
          provider: true,
          model: true,
          status: true,
          errorMessage: true,
          createdAt: true,
        }
      }),
      db.history.count()
    ])

    return NextResponse.json({
      data: history,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (error) {
    console.error('Failed to fetch history:', error)
    return NextResponse.json(
      { error: '获取历史记录失败' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: '缺少历史记录 ID' },
        { status: 400 }
      )
    }

    await db.history.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete history:', error)
    return NextResponse.json(
      { error: '删除历史记录失败' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question, result, databaseType, provider, model, status: recordStatus, id: updateId } = body

    if (!question || !result) {
      return NextResponse.json(
        { error: '缺少必要字段' },
        { status: 400 }
      )
    }

    if (updateId) {
      // 更新已有记录
      const updated = await db.history.update({
        where: { id: updateId },
        data: {
          result: typeof result === 'string' ? result : JSON.stringify(result),
          status: recordStatus || 'success'
        }
      })
      return NextResponse.json({ success: true, id: updated.id })
    }

    // 创建新记录
    const created = await db.history.create({
      data: {
        question,
        result: typeof result === 'string' ? result : JSON.stringify(result),
        databaseType: databaseType || 'mysql',
        provider: provider || '',
        model: model || '',
        status: recordStatus || 'success'
      }
    })

    return NextResponse.json({ success: true, id: created.id })
  } catch (error) {
    console.error('Failed to save history:', error)
    return NextResponse.json(
      { error: '保存历史记录失败' },
      { status: 500 }
    )
  }
}
