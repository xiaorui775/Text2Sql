import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
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
          result: true,
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
