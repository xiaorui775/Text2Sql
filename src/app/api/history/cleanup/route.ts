import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const daysToKeep = parseInt(searchParams.get('days') || '7', 10)

    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000)

    const result = await db.history.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    })

    return NextResponse.json({
      success: true,
      deleted: result.count,
      cutoffDate: cutoffDate.toISOString()
    })
  } catch (error) {
    console.error('Failed to cleanup history:', error)
    return NextResponse.json(
      { error: '清理历史记录失败' },
      { status: 500 }
    )
  }
}
