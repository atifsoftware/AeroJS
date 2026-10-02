/**
 * @file session-guard.ts
 * @description Server-side Session Authentication Guard for AeroJS.
 * Handles web portal logins, user state persistence, and session fixation prevention.
 */

import type { AeroContext } from '../../core/context.js';
import type { GuardContract, AuthUser, LoginOptions } from './guard.js';
import type { SessionManager } from '../../session/session-manager.js';
import { UnauthorizedError, ForbiddenError } from '../../core/errors.js';
import { hash, hashVerify } from '../../security/hash.js';

export interface SessionGuardConfig {
  /**
   * Session key where user data is stored. Default: 'auth_user'
   */
  userKey?: string;

  /**
   * Callback to fetch user by ID from your database.
   * Example: (id) => User.find(id)
   */
  provider: (id: string | number) => Promise<AuthUser | null>;
}

export class SessionGuard implements GuardContract {
  private _user: AuthUser | null = null;
  private _checked = false;
  private readonly userKey: string;
  private readonly provider: (id: string | number) => Promise<AuthUser | null>;
  private session: SessionManager;
  private ctx: AeroContext;

  constructor(ctx: AeroContext, session: SessionManager, config: SessionGuardConfig) {
    this.ctx = ctx;
    this.session = session;
    this.userKey = config.userKey ?? 'auth_user';
    this.provider = config.provider;
  }

  public user(): AuthUser | null {
    return this._user;
  }

  public check(): boolean {
    return this._user !== null;
  }

  /**
   * Authenticates the user from the session, throws if not authenticated.
   */
  public async authenticate(): Promise<AuthUser> {
    if (this._checked) {
      if (!this._user) throw new UnauthorizedError('Session expired or not authenticated');
      return this._user;
    }

    this._checked = true;
    const sessionData = await this.session.get<{ id: string | number }>(this.userKey);

    if (!sessionData?.id) {
      throw new UnauthorizedError('Not authenticated. Please log in.');
    }

    const user = await this.provider(sessionData.id);
    if (!user) {
      await this.session.forget(this.userKey);
      throw new UnauthorizedError('User account not found or deactivated.');
    }

    this._user = user;
    return user;
  }

  /**
   * Silently checks authentication without throwing.
   */
  public async silentCheck(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Logs a user into the session.
   * Example: ctx.auth.use('session').login(user, { remember: true });
   */
  public async login(user: AuthUser, options: LoginOptions = {}): Promise<void> {
    await this.session.put(this.userKey, { id: user.id });

    if (options.remember) {
      const duration = options.rememberDuration ?? 30 * 24 * 60 * 60; // 30 days
      await this.session.setExpiry(duration);
    }

    // Regenerate session ID to prevent fixation attacks
    await this.session.regenerate();
    this._user = user;
    this._checked = true;
  }

  /**
   * Logs the authenticated user out and destroys their session.
   */
  public async logout(): Promise<void> {
    await this.session.forget(this.userKey);
    await this.session.regenerate();
    this._user = null;
    this._checked = false;
  }

  /**
   * Attempts login with a password credential check.
   * Returns true on success, false on failure (never throws for wrong password).
   */
  public async attempt(
    user: AuthUser & { password: string },
    plainPassword: string,
    options: LoginOptions = {}
  ): Promise<boolean> {
    const valid = await hashVerify(user.password, plainPassword);
    if (!valid) return false;

    // Strip password before storing
    const { password: _pw, ...safeUser } = user;
    await this.login(safeUser, options);
    return true;
  }
}
