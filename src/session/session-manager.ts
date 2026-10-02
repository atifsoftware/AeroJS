/**
 * @file session-manager.ts
 * @description Server-side Session Manager for AeroJS.
 * Provides a clean API for reading/writing session data per HTTP request.
 * Hospital use: Cashier shift sessions, CSRF tokens, flash messages, terminal binding.
 */

import crypto from 'node:crypto';
import type { AeroContext } from '../core/context.js';
import type { SessionDriver } from './session-driver.js';
import { MemorySessionDriver } from './session-driver.js';
import type { Middleware } from '../core/types.js';

export interface SessionConfig {
  /**
   * Session driver. Default: memory (use redis/file for production).
   */
  driver?: SessionDriver;

  /**
   * Session cookie name. Default: 'aero_session'.
   */
  cookieName?: string;

  /**
   * Session lifetime in seconds. Default: 28800 (8 hours = one hospital shift).
   */
  lifetime?: number;

  /**
   * Cookie security options.
   */
  cookie?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none' | boolean;
    path?: string;
    domain?: string;
  };
}

/**
 * Per-request Session Manager.
 * Loaded lazily from the driver on first access, written back at response end.
 */
export class SessionManager {
  private sessionId: string;
  private data: Record<string, unknown> = {};
  private _loaded = false;
  private _dirty = false;
  private readonly driver: SessionDriver;
  private readonly config: Required<SessionConfig>;
  private readonly ctx: AeroContext;

  constructor(ctx: AeroContext, sessionId: string, config: Required<SessionConfig>) {
    this.ctx = ctx;
    this.sessionId = sessionId;
    this.driver = config.driver;
    this.config = config;
  }

  /**
   * Lazily load session data from the driver.
   */
  private async ensureLoaded(): Promise<void> {
    if (this._loaded) return;
    this.data = await this.driver.read(this.sessionId);
    this._loaded = true;
  }

  /** Get a session value. */
  public async get<T = unknown>(key: string): Promise<T | undefined> {
    await this.ensureLoaded();
    return this.data[key] as T | undefined;
  }

  /** Get all session data. */
  public async all(): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    return { ...this.data };
  }

  /** Set a session value. */
  public async put(key: string, value: unknown): Promise<void> {
    await this.ensureLoaded();
    this.data[key] = value;
    this._dirty = true;
  }

  /** Check if a session key exists. */
  public async has(key: string): Promise<boolean> {
    await this.ensureLoaded();
    return Object.prototype.hasOwnProperty.call(this.data, key);
  }

  /** Remove a session key. */
  public async forget(key: string): Promise<void> {
    await this.ensureLoaded();
    delete this.data[key];
    this._dirty = true;
  }

  /** Clear all session data. */
  public async flush(): Promise<void> {
    await this.ensureLoaded();
    this.data = {};
    this._dirty = true;
  }

  /**
   * Set or get a flash message (single-use — removed on next request).
   * Hospital use: "Shift closed successfully" message after cashier close.
   */
  public async flash(key: string, value?: unknown): Promise<unknown> {
    await this.ensureLoaded();
    if (value !== undefined) {
      this.data[`__flash_${key}`] = value;
      this._dirty = true;
      return value;
    }
    const flashKey = `__flash_${key}`;
    const val = this.data[flashKey];
    delete this.data[flashKey];
    if (val !== undefined) this._dirty = true;
    return val;
  }

  /**
   * Update session lifetime for "remember me" functionality.
   */
  public async setExpiry(_seconds: number): Promise<void> {
    // Lifetime is applied at commit time via the driver TTL
    // Override is not supported after construction — set lifetime in SessionConfig
  }

  /**
   * Regenerate session ID to prevent session fixation attacks.
   * Call this after login and logout.
   */
  public async regenerate(): Promise<void> {
    await this.ensureLoaded();
    // Destroy old session
    await this.driver.destroy(this.sessionId);
    // Generate new session ID
    this.sessionId = crypto.randomBytes(32).toString('hex');
    // Write data under new ID
    await this.driver.write(this.sessionId, this.data, this.config.lifetime);
    this._dirty = false;
    // Update cookie
    this.writeSessionCookie();
  }

  /**
   * Destroy the current session completely.
   */
  public async destroy(): Promise<void> {
    await this.driver.destroy(this.sessionId);
    this.data = {};
    this._loaded = false;
    this._dirty = false;
    // Clear session cookie
    this.ctx.clearCookie(this.config.cookieName);
  }

  /**
   * Persist session data to driver (called automatically at end of request).
   */
  public async commit(): Promise<void> {
    if (!this._dirty && !this._loaded) return;
    await this.ensureLoaded();
    await this.driver.write(this.sessionId, this.data, this.config.lifetime);
    if ((this.driver as any).isClientSide && typeof (this.driver as any).getEncryptedCookieValue === 'function') {
      this.sessionId = (this.driver as any).getEncryptedCookieValue(this.data);
    }
    this.writeSessionCookie();
    this._dirty = false;
  }

  private writeSessionCookie(): void {
    this.ctx.cookie(this.config.cookieName, this.sessionId, {
      httpOnly: this.config.cookie.httpOnly,
      secure: this.config.cookie.secure,
      sameSite: this.config.cookie.sameSite,
      path: this.config.cookie.path,
      maxAge: this.config.lifetime,
    });
  }

  public getId(): string {
    return this.sessionId;
  }
}

/**
 * Global Session Plugin factory.
 * Attaches ctx.session to every request and auto-commits at response end.
 *
 * @example
 * app.use(sessionPlugin({
 *   driver: new RedisSessionDriver(redisClient),
 *   lifetime: 8 * 3600, // 8-hour hospital shift
 *   cookie: { httpOnly: true, secure: true, sameSite: 'Strict' }
 * }));
 */
export function sessionPlugin(config: SessionConfig = {}): Middleware {
  const resolvedConfig: Required<SessionConfig> = {
    driver: config.driver ?? new MemorySessionDriver(),
    cookieName: config.cookieName ?? 'aero_session',
    lifetime: config.lifetime ?? 8 * 60 * 60, // 8 hours
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      ...config.cookie,
    },
  };

  return async (ctx, next) => {
    // Extract existing session ID from cookie, or create a new one
    const existingId = ctx.cookies[resolvedConfig.cookieName];
    const isClientSide = !!(resolvedConfig.driver as any).isClientSide;
    const isValidId = existingId && (
      isClientSide ? existingId.startsWith('aero:enc:') : existingId.length === 64
    );
    const sessionId = isValidId
      ? existingId
      : (isClientSide ? '' : crypto.randomBytes(32).toString('hex'));

    const session = new SessionManager(ctx, sessionId, resolvedConfig);
    (ctx as any).session = session;

    try {
      await next();
    } finally {
      // Auto-commit session after response
      await session.commit().catch(() => {});
    }
  };
}
