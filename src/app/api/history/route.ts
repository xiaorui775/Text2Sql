import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const [history, total] = await Promise.all([
      db.history.findMany({
        orderBy: {
          createdAt: 'desc'
        }
      }),
      db.history.count()
    ])

    return NextResponse.json({
      data: history,
      total
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
