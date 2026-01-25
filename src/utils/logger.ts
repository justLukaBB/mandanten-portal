/**
 * Structured logging utility for client-side code
 * Replaces console.log/error/warn with proper logging levels
 */

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const getCurrentLogLevel = (): LogLevel => {
  const envLevel = process.env.REACT_APP_LOG_LEVEL;
  if (envLevel) {
    const level = LogLevel[envLevel.toUpperCase() as keyof typeof LogLevel];
    if (level !== undefined) return level;
  }
  return process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG;
};

const currentLogLevel = getCurrentLogLevel();

class Logger {
  private module: string;

  constructor(module: string = '') {
    this.module = module;
  }

  private formatMessage(level: string, message: string, ...args: any[]): any[] {
    const timestamp = new Date().toISOString();
    const modulePrefix = this.module ? `[${this.module}]` : '';
    const prefix = `${timestamp} ${level} ${modulePrefix}`;
    
    if (args.length > 0) {
      return [prefix, message, ...args];
    }
    return [prefix, message];
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= currentLogLevel;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(...this.formatMessage('DEBUG', message, ...args));
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(...this.formatMessage('INFO', message, ...args));
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(...this.formatMessage('WARN', message, ...args));
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(...this.formatMessage('ERROR', message, ...args));
    }
  }

  // Convenience method for logging errors with stack traces
  errorWithStack(message: string, error: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(...this.formatMessage('ERROR', message));
      if (error?.stack) {
        console.error('Stack trace:', error.stack);
      }
      if (error?.message) {
        console.error('Error message:', error.message);
      }
    }
  }
}

// Create default logger instance
const defaultLogger = new Logger();

// Factory function to create module-specific loggers
export function createLogger(module: string): Logger {
  return new Logger(module);
}

// Export default logger methods for convenience
export const logger = {
  debug: (...args: Parameters<Logger['debug']>) => defaultLogger.debug(...args),
  info: (...args: Parameters<Logger['info']>) => defaultLogger.info(...args),
  warn: (...args: Parameters<Logger['warn']>) => defaultLogger.warn(...args),
  error: (...args: Parameters<Logger['error']>) => defaultLogger.error(...args),
  errorWithStack: (...args: Parameters<Logger['errorWithStack']>) => defaultLogger.errorWithStack(...args),
};

export default logger;
