let isShuttingDown = false

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { env } = await import('./lib/env')
    console.log(`✅ Environment validated (${env.NODE_ENV})`)

    // Graceful shutdown handling
    const shutdown = (signal: string) => {
      if (isShuttingDown) return
      isShuttingDown = true
      console.log(`\nReceived ${signal}, shutting down gracefully...`)

      // 给正在进行的请求一个窗口期完成
      setTimeout(() => {
        console.log('Graceful shutdown complete')
        process.exit(0)
      }, 5000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }
}