import { NextRequest, NextResponse } from 'next/server'

const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10

const requestCounts = new Map<string, { count: number; resetAt: number }>()

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return ip
}

export function checkRateLimit(request: NextRequest): { allowed: boolean; remaining: number; resetAt: number } | null {
  const clientId = getClientIdentifier(request)
  const now = Date.now()

  const record = requestCounts.get(clientId)

  if (!record || now > record.resetAt) {
    requestCounts.set(clientId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    })
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt }
  }

  record.count++
  requestCounts.set(clientId, record)

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count, resetAt: record.resetAt }
}

export function withRateLimit(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const rateLimitResult = checkRateLimit(request)

  if (!rateLimitResult) {
    return handler()
  }

  if (!rateLimitResult.allowed) {
    return Promise.resolve(
      NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.resetAt / 1000))
          }
        }
      )
    )
  }

  return handler().then(response => {
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS))
    response.headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining))
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(rateLimitResult.resetAt / 1000)))
    return response
  })
}