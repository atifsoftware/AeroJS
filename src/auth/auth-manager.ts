/**
 * @file auth-manager.ts
 * @description Central Auth Manager for AeroJS.
 * Manages multiple named guards (session, jwt, api) and exposes ctx.auth.use('guard').
 * Hospital use: ctx.auth.use('session') for cashiers, ctx.auth.use('jwt') for doctors.
 */

import type { AeroContext } from '../core/context.js';
import type { GuardContract, AuthUser } from './guards/guard.js';
import { SessionGuard, type SessionGuardConfig } from './guards/session-guard.js';
import { JwtGuard, type JwtGuardConfig } from './guards/jwt-guard.js';
import { ApiTokenGuard, type ApiTokenGuardConfig } from './guards/api-token-guard.js';
import type { SessionManager } from '../session/session-manager.js';
import type { Middleware } from '../core/types.js';
import { UnauthorizedError, ForbiddenError } from '../core/errors.js';

export type GuardDriverName = 'session' | 'jwt' | 'api';

export type GuardDriverConfig =
  | { driver: 'session'; config: SessionGuardConfig }
  | { driver: 'jwt'; config: JwtGuardConfig }
  | { driver: 'api'; config: ApiTokenGuardConfig };

export interface AuthConfig {
  /**
   * Default guard to use when calling ctx.auth.use() with no arguments.
   */
  default?: string;

  /**
   * Named guard definitions.
   */
  guards: Record<string, GuardDriverConfig>;
}

/**
 * Per-request Auth Manager — attached to ctx.auth by authPlugin.
 */
export class Auth {
  private guards = new Map<string, GuardContract>();
  private defaultGuardName: string;
  private config: AuthConfig;
  private ctx: AeroContext;
  private sessionManager?: SessionManager;

  constructor(ctx: AeroContext, config: AuthConfig, sessionManager?: SessionManager) {
    this.ctx = ctx;
    this.config = config;
    this.defaultGuardName = config.default ?? Object.keys(config.guards)[0] ?? 'session';
    this.sessionManager = sessionManager;
  }

  /**
   * Returns the named guard instance (or default if name is omitted).
   * Guards are lazily instantiated per request.
   *
   * @example
   * // Cashier session auth
   * await ctx.auth.use('session').authenticate();
   *
   * // Doctor JWT auth
   * const user = await ctx.auth.use('jwt').authenticate();
   */
  public use(name?: string): any {
    const guardName = name ?? this.defaultGuardName;

    if (this.guards.has(guardName)) {
      return this.guards.get(guardName)!;
    }

    const guardDef = this.config.guards[guardName];
    if (!guardDef) {
      throw new Error(`[AeroJS Auth] Guard "${guardName}" is not configured.`);
    }

    let guard: GuardContract;

    switch (guardDef.driver) {
      case 'session': {
        if (!this.sessionManager) {
          throw new Error('[AeroJS Auth] Session guard requires a SessionManager. Did you call app.useSession()?');
        }
        guard = new SessionGuard(this.ctx, this.sessionManager, guardDef.config);
        break;
      }
      case 'jwt': {
        guard = new JwtGuard(this.ctx, guardDef.config);
        break;
      }
      case 'api': {
        guard = new ApiTokenGuard(this.ctx, guardDef.config);
        break;
      }
      default: {
        throw new Error(`[AeroJS Auth] Unknown guard driver: ${(guardDef as any).driver}`);
      }
    }

    this.guards.set(guardName, guard);
    return guard;
  }

  /**
   * Returns the authenticated user from the default guard, or null.
   */
  public user(): AuthUser | null {
    return this.use().user();
  }

  /**
   * Checks if the current user is authenticated on the default guard.
   */
  public check(): boolean {
    return this.use().check();
  }
}

/**
 * Global Auth Manager — stores config for the application lifetime.
 */
export class AuthManager {
  private config: AuthConfig = { guards: {} };

  public configure(config: AuthConfig): this {
    this.config = config;
    return this;
  }

  /**
   * Creates a per-request Auth instance bound to the given context.
   */
  public forContext(ctx: AeroContext, sessionManager?: SessionManager): Auth {
    return new Auth(ctx, this.config, sessionManager);
  }
}

export const authManager = new AuthManager();

/**
 * Middleware factory that attaches ctx.auth to every request.
 * Must be registered early in the middleware chain.
 *
 * @example
 * app.use(authPlugin(authManager, sessionManager));
 */
export function authPlugin(manager: AuthManager, sessionManager?: SessionManager): Middleware {
  return async (ctx, next) => {
    (ctx as any).auth = manager.forContext(ctx, sessionManager);
    await next();
  };
}

/**
 * Route-level middleware factory — protects a route for a specific guard.
 * Throws UnauthorizedError if not authenticated.
 *
 * @example
 * router.get('/cashier/dashboard', handler).middleware(auth('session'));
 * router.get('/api/doctor/patients', handler).middleware(auth('jwt'));
 */
export function auth(guardName?: string): Middleware {
  return async (ctx, next) => {
    const authCtx = (ctx as any).auth as Auth;
    if (!authCtx) throw new Error('[AeroJS Auth] authPlugin middleware is not mounted. Add app.use(authPlugin(...))');

    await authCtx.use(guardName).authenticate();
    await next();
  };
}
