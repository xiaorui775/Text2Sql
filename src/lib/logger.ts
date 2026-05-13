type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
  stage?: string
}

class Logger {
  private formatMessage(entry: LogEntry): string {
    const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`
    if (entry.stage) {
      return `${base} (stage: ${entry.stage})`
    }
    return base
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, stage?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      stage
    }

    const formatted = this.formatMessage(entry)
    const output = context ? `${formatted} ${JSON.stringify(context)}` : formatted

    switch (level) {
      case 'error':
        console.error(output)
        break
      case 'warn':
        console.warn(output)
        break
      default:
        console.log(output)
    }
  }

  debug(message: string, context?: Record<string, any>, stage?: string) {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, context, stage)
    }
  }

  info(message: string, context?: Record<string, any>, stage?: string) {
    this.log('info', message, context, stage)
  }

  warn(message: string, context?: Record<string, any>, stage?: string) {
    this.log('warn', message, context, stage)
  }

  error(message: string, context?: Record<string, any>, stage?: string) {
    this.log('error', message, context, stage)
  }

  stage(stage: string, message: string, context?: Record<string, any>) {
    this.info(message, context, stage)
  }
}

export const logger = new Logger()
