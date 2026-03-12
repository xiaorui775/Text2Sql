import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const history = await db.history.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 50 // Limit to last 50 records
    })

    return NextResponse.json(history)
  } catch (error) {
    console.error('Failed to fetch history:', error)
    return NextResponse.json(
      { error: '获取历史记录失败' },
      { status: 500 }
    )
  }
}
