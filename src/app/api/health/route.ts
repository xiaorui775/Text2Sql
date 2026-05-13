import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const health: {
    status: 'healthy' | 'unhealthy'
    timestamp: string
    uptime: number
    checks: {
      database: { status: 'ok' | 'error'; latency?: number; error?: string }
    }
  } = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: { status: 'ok' }
    }
  }

  const start = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    health.checks.database.latency = Date.now() - start
  } catch (error) {
    health.checks.database.status = 'error'
    health.checks.database.error = error instanceof Error ? error.message : 'Unknown error'
    health.status = 'unhealthy'
  }

  return NextResponse.json(health, {
    status: health.status === 'healthy' ? 200 : 503
  })
}