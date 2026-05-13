import { NextRequest, NextResponse } from 'next/server'

interface MetricData {
  requests: number
  successes: number
  failures: number
  totalLatencyMs: number
  latencies: number[]
}

const metrics: MetricData = {
  requests: 0,
  successes: 0,
  failures: 0,
  totalLatencyMs: 0,
  latencies: []
}

const MAX_LATENCY_SAMPLES = 1000

export function recordRequest(durationMs: number, success: boolean) {
  metrics.requests++
  metrics.totalLatencyMs += durationMs

  if (success) {
    metrics.successes++
  } else {
    metrics.failures++
  }

  metrics.latencies.push(durationMs)
  if (metrics.latencies.length > MAX_LATENCY_SAMPLES) {
    metrics.latencies.shift()
  }
}

export function getMetrics() {
  const latencyP50 = metrics.latencies.length > 0
    ? metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.5)]
    : 0
  const latencyP95 = metrics.latencies.length > 0
    ? metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.95)]
    : 0
  const latencyP99 = metrics.latencies.length > 0
    ? metrics.latencies.sort((a, b) => a - b)[Math.floor(metrics.latencies.length * 0.99)]
    : 0

  return {
    requests: {
      total: metrics.requests,
      success: metrics.successes,
      failure: metrics.failures,
      successRate: metrics.requests > 0
        ? ((metrics.successes / metrics.requests) * 100).toFixed(2) + '%'
        : '0%'
    },
    latency: {
      avg: metrics.requests > 0
        ? (metrics.totalLatencyMs / metrics.requests).toFixed(0) + 'ms'
        : '0ms',
      p50: latencyP50 + 'ms',
      p95: latencyP95 + 'ms',
      p99: latencyP99 + 'ms',
      samples: metrics.latencies.length
    }
  }
}

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(getMetrics())
}

export async function DELETE() {
  metrics.requests = 0
  metrics.successes = 0
  metrics.failures = 0
  metrics.totalLatencyMs = 0
  metrics.latencies = []
  return NextResponse.json({ success: true, message: 'Metrics reset' })
}