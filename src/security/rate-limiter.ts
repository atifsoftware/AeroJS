/**
 * @file rate-limiter.ts
 * @description Zero-dependency, memory-safe sliding/fixed-window Rate Limiter for Aero.
 */

import type { Middleware, NextFunction } from '../core/types.js';
import type { AeroContext, DefaultState } from '../core/context.js';
import { AeroError } from '../core/errors.js';

export interface RateLimitInfo {
  totalHits: number;
  resetTime: number; // Unix timestamp in ms
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitInfo> | RateLimitInfo;
  decrement(key: string): Promise<void> | void;
  resetKey(key: string): Promise<void> | void;
  resetAll(): Promise<void> | void;
  destroy?(): void;
}

export interface RateLimitOptions<State = any> {
  /**
   * Time window in milliseconds. Default: 60,000 (1 minute).
   */
  windowMs?: number;

  /**
   * Max number of connections/requests allowed during the windowMs. Default: 100.
   */
  max?: number;

  /**
   * The response status code to send when limit is reached. Default: 429.
   */
  statusCode?: number;

  /**
   * The error message or payload to send when rate limit is exceeded.
   */
  message?: string | Record<string, unknown>;

  /**
   * Whether to send standard rate limit headers (X-RateLimit-* and Retry-After). Default: true.
   */
  headers?: boolean;

  /**
   * Function used to generate an identifier key for the client. Default: ctx.ip
   */
  keyGenerator?: (ctx: AeroContext<State>) => string;

  /**
   * Function to skip rate limiting for specific requests (e.g. internal health checks).
   */
  skip?: (ctx: AeroContext<State>) => boolean | Promise<boolean>;

  /**
   * Custom handler to invoke when rate limit is exceeded.
   */
  handler?: (ctx: AeroContext<State>, next: NextFunction) => Promise<void> | void;

  /**
   * Custom store instance. Defaults to MemoryRateLimitStore.
   */
  store?: RateLimitStore;
}

export class TooManyRequestsError extends AeroError {
  public override name = 'TooManyRequestsError';
  public retryAfter: number;

  constructor(message: string, retryAfter: number, details?: unknown) {
    super(message, 429, 'TOO_MANY_REQUESTS', details);
    this.retryAfter = retryAfter;
  }
}

/**
 * Memory-safe in-memory store for rate limiting with automatic garbage collection of expired buckets.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetTime: number }>();
  private intervalTimer?: NodeJS.Timeout;

  constructor(cleanupIntervalMs = 60_000) {
    // Periodic garbage collection to prevent memory leaks from millions of unique IPs
    this.intervalTimer = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);

    // Unref timer so it does not keep Node.js process alive in tests or CLI scripts
    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  public increment(key: string, windowMs: number): RateLimitInfo {
    const now = Date.now();
    const record = this.hits.get(key);

    if (!record || now >= record.resetTime) {
      const resetTime = now + windowMs;
      this.hits.set(key, { count: 1, resetTime });
      return { totalHits: 1, resetTime };
    }

    record.count += 1;
    return { totalHits: record.count, resetTime: record.resetTime };
  }

  public decrement(key: string): void {
    const record = this.hits.get(key);
    if (record && record.count > 0) {
      record.count -= 1;
    }
  }

  public resetKey(key: string): void {
    this.hits.delete(key);
  }

  public resetAll(): void {
    this.hits.clear();
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.hits.entries()) {
      if (now >= record.resetTime) {
        this.hits.delete(key);
      }
    }
  }

  public destroy(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
    this.hits.clear();
  }
}

/**
 * Creates a Rate Limiter middleware for Aero applications.
 */
export function rateLimit<State = DefaultState>(options: RateLimitOptions<State> = {}): Middleware<State> {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 100;
  const statusCode = options.statusCode ?? 429;
  const sendHeaders = options.headers ?? true;
  const message = options.message ?? 'Too many requests, please try again later.';
  const store = options.store ?? new MemoryRateLimitStore(Math.min(windowMs, 60_000));

  const keyGen = options.keyGenerator ?? ((ctx: AeroContext<any>) => ctx.req.ip || '127.0.0.1');

  return async (ctx: AeroContext<State>, next: NextFunction) => {
    // Check skip predicate
    if (options.skip) {
      const shouldSkip = await options.skip(ctx);
      if (shouldSkip) {
        return next();
      }
    }

    const key = keyGen(ctx);
    const { totalHits, resetTime } = await store.increment(key, windowMs);
    const now = Date.now();
    const remaining = Math.max(0, max - totalHits);
    const resetTimeSec = Math.ceil(resetTime / 1000);
    const retryAfterSec = Math.max(1, Math.ceil((resetTime - now) / 1000));

    // Attach headers
    if (sendHeaders) {
      ctx.res.setHeader('X-RateLimit-Limit', String(max));
      ctx.res.setHeader('X-RateLimit-Remaining', String(remaining));
      ctx.res.setHeader('X-RateLimit-Reset', String(resetTimeSec));
    }

    // Limit exceeded!
    if (totalHits > max) {
      if (sendHeaders) {
        ctx.res.setHeader('Retry-After', String(retryAfterSec));
      }

      if (options.handler) {
        await options.handler(ctx, next);
        return;
      }

      ctx.res.status(statusCode);
      if (typeof message === 'object') {
        ctx.res.json(message);
      } else {
        ctx.res.json({
          error: {
            message,
            statusCode,
            retryAfter: retryAfterSec,
          },
        });
      }
      return;
    }

    await next();
  };
}
