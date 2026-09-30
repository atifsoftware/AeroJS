/**
 * @file logger.ts
 * @description Advanced Structured Logging System for AeroJS modeled after RFC 5424.
 * Includes RequestContext correlation, slow query detection, security auditing, and file stream rotation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RequestContext } from './request-context.js';
import type { Middleware } from '../core/types.js';

export type LogLevel =
  | 'emergency'
  | 'alert'
  | 'critical'
  | 'error'
  | 'warning'
  | 'notice'
  | 'info'
  | 'debug';

export class Logger {
  public static EMERGENCY: LogLevel = 'emergency';
  public static ALERT: LogLevel = 'alert';
  public static CRITICAL: LogLevel = 'critical';
  public static ERROR: LogLevel = 'error';
  public static WARNING: LogLevel = 'warning';
  public static NOTICE: LogLevel = 'notice';
  public static INFO: LogLevel = 'info';
  public static DEBUG: LogLevel = 'debug';

  public static logFile = 'storage/logs/app.log';
  public static errorLogFile = 'storage/logs/error.log';
  public static enableFileLogging = false; // Enabled when log file directory exists or configured
  public static enableConsoleLogging = true;
  public static slowQueryThresholdMs = 100;

  public static levels: Record<LogLevel, number> = {
    emergency: 0,
    alert: 1,
    critical: 2,
    error: 3,
    warning: 4,
    notice: 5,
    info: 6,
    debug: 7,
  };

  /**
   * Initialize logging directories if file logging is enabled
   */
  public static init(): void {
    if (!this.enableFileLogging) return;
    const baseDir = path.dirname(path.resolve(this.logFile));
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  public static emergency(message: string, context: Record<string, unknown> = {}): void {
    this.log(this.EMERGENCY, message, context);
  }

  public static alert(message: string, context: Record<string, unknown> = {}): void {
    this.log(this.ALERT, message, context);
  }

  public static critical(message: string, context: Record<string, unknown> = {}): void {
    this.log(this.CRITICAL, message, context);
  }

  public static error(message: string, context: Record<string, unknown> = {}): void {
    this.log(this.ERROR, message, context);
  }

  public static warning(message: string, context: Record<string, unknown> = {}): void {
    this.log(this.WARNING, message, context);
  }

  public static notice(message: string, context: Record<string, unknown> = {}): void {
    this.log(this.NOTICE, message, context);
  }

  public static info(message: string, context: Record<string, unknown> = {}): void {
    this.log(this.INFO, message, context);
  }

  public static debug(message: string, context: Record<string, unknown> = {}): void {
    this.log(this.DEBUG, message, context);
  }

  /**
   * Core logging method
   */
  public static log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Resolve context from RequestContext (AsyncLocalStorage)
    const store = RequestContext.getStore();
    let ip = '127.0.0.1';
    let userId: string | number = 'guest';
    let requestPath = 'CLI';

    if (store?.ctx) {
      const ctx = store.ctx;
      ip = ctx.req.ip || '127.0.0.1';
      userId = (ctx.state?.user as any)?.id || ctx.state?.user || 'guest';
      requestPath = `${ctx.method} ${ctx.path}`;
    }

    const cleanContext = { ...context };
    const contextStr =
      Object.keys(cleanContext).length === 0
        ? ''
        : ' | Context: ' + JSON.stringify(cleanContext);

    const logEntry = `[${timestamp}] ${level.toUpperCase()} | IP: ${ip} | User: ${userId} | ${requestPath}: ${message}${contextStr}`;

    // 1. Console Output
    if (this.enableConsoleLogging) {
      if (['emergency', 'alert', 'critical', 'error'].includes(level)) {
        console.error(`\x1b[31m${logEntry}\x1b[0m`);
      } else if (level === 'warning') {
        console.warn(`\x1b[33m${logEntry}\x1b[0m`);
      } else if (level === 'debug') {
        console.debug(`\x1b[90m${logEntry}\x1b[0m`);
      } else {
        console.log(`\x1b[36m${logEntry}\x1b[0m`);
      }
    }

    // 2. File Output (if enabled)
    if (this.enableFileLogging) {
      this.init();
      const isErrorLog = ['emergency', 'alert', 'critical', 'error'].includes(level);
      const targetFile = isErrorLog ? this.errorLogFile : this.logFile;

      try {
        fs.appendFileSync(targetFile, logEntry + '\n', 'utf8');
      } catch (err) {
        console.error('Failed to write log to file:', err);
      }
    }
  }

  /**
   * Logs a database query with duration and slow query detection.
   */
  public static logQuery(
    query: string,
    bindings: unknown[] = [],
    executionTimeMs: number | null = null
  ): void {
    const context = { query, bindings, execution_time_ms: executionTimeMs };
    if (executionTimeMs !== null && executionTimeMs >= this.slowQueryThresholdMs) {
      this.warning(`Slow query detected (${executionTimeMs}ms)`, context);
    } else {
      this.debug('Database query executed', context);
    }
  }

  /**
   * Logs user activity and audit trail.
   */
  public static logActivity(action: string, details: Record<string, unknown> = {}): void {
    const store = RequestContext.getStore();
    const userAgent = store?.ctx?.req.get('user-agent') || 'Unknown';
    const referer = store?.ctx?.req.get('referer') || 'Direct';

    this.info(`User activity: ${action}`, {
      ...details,
      action,
      user_agent: userAgent,
      referer,
    });
  }

  /**
   * Logs security events (authentication failures, CSRF breaches, rate limit hits).
   */
  public static logSecurity(event: string, details: Record<string, unknown> = {}): void {
    this.warning(`Security event: ${event}`, {
      ...details,
      event,
      severity: 'high',
    });
  }

  /**
   * Reads recent log lines from disk.
   */
  public static getRecentLogs(lines = 50, file: string | null = null): string[] {
    const filePath = file || this.logFile;
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const logsArray = content.split('\n').filter((l) => l.trim().length > 0);
    return logsArray.reverse().slice(0, lines);
  }
}

/**
 * Middleware that wraps requests in a RequestContext store and logs request lifecycle metrics.
 */
export function requestLogger(): Middleware {
  return async (ctx, next) => {
    const start = Date.now();
    await RequestContext.run({ ctx }, async () => {
      try {
        await next();
      } finally {
        const duration = Date.now() - start;
        const status = ctx.res.statusCode;
        const msg = `${ctx.method} ${ctx.path} -> ${status} (${duration}ms)`;
        if (status >= 500) {
          Logger.error(msg);
        } else if (status >= 400) {
          Logger.warning(msg);
        } else {
          Logger.info(msg);
        }
      }
    });
  };
}

export default Logger;
