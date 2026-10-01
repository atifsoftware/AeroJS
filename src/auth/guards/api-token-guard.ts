/**
 * @file api-token-guard.ts
 * @description Database-backed API Token Authentication Guard for AeroJS.
 * Tokens are stored in DB, can be revoked individually, and carry scopes.
 * Hospital use: LIS analyzer integration, FHIR gateway, Corporate TPA API access.
 */

import type { AeroContext } from '../../core/context.js';
import type { GuardContract, AuthUser } from './guard.js';
import { UnauthorizedError } from '../../core/errors.js';
import crypto from 'node:crypto';

export interface ApiToken {
  id: string | number;
  userId: string | number;
  token: string;      // hashed token in DB
  name: string;       // human-readable name, e.g. "LIS Interface Token"
  abilities: string[]; // e.g. ['lab:read', 'lab:write']
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}

export interface ApiTokenGuardConfig {
  /**
   * Callback to find a token record by its hash.
   */
  findToken: (hashedToken: string) => Promise<ApiToken | null>;

  /**
   * Callback to fetch the associated user by userId.
   */
  findUser: (userId: string | number) => Promise<AuthUser | null>;

  /**
   * Callback to update last_used_at timestamp after successful auth.
   */
  touchToken?: (tokenId: string | number) => Promise<void>;
}

export interface GeneratedToken {
  plainToken: string;   // Show this ONCE to the user — store the hash only
  hashedToken: string;
  prefix: string;       // e.g. "aero_" for easy identification
}

export class ApiTokenGuard implements GuardContract {
  private _user: AuthUser | null = null;
  private _token: ApiToken | null = null;
  private _checked = false;
  private readonly config: ApiTokenGuardConfig;
  private ctx: AeroContext;

  constructor(ctx: AeroContext, config: ApiTokenGuardConfig) {
    this.ctx = ctx;
    this.config = config;
  }

  public user(): AuthUser | null {
    return this._user;
  }

  public token(): ApiToken | null {
    return this._token;
  }

  public check(): boolean {
    return this._user !== null;
  }

  /**
   * Checks if the token has a specific ability/scope.
   * Hospital use: ctx.auth.use('api').can('lab:write')
   */
  public can(ability: string): boolean {
    if (!this._token) return false;
    return this._token.abilities.includes('*') || this._token.abilities.includes(ability);
  }

  private extractToken(): string | null {
    // Authorization: Bearer aero_xxxxx
    const authHeader = this.ctx.req.get('authorization');
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && /^Bearer$/i.test(parts[0]!)) {
        return parts[1] ?? null;
      }
    }
    // Fallback: X-API-Token header
    return this.ctx.req.get('x-api-token') ?? null;
  }

  /**
   * Hashes a plain token using SHA-256 for secure database storage.
   */
  private hashToken(plain: string): string {
    return crypto.createHash('sha256').update(plain).digest('hex');
  }

  public async authenticate(): Promise<AuthUser> {
    if (this._checked) {
      if (!this._user) throw new UnauthorizedError('Invalid API token');
      return this._user;
    }

    this._checked = true;
    const plain = this.extractToken();
    if (!plain) throw new UnauthorizedError('API token not provided');

    const hashed = this.hashToken(plain);
    const tokenRecord = await this.config.findToken(hashed);

    if (!tokenRecord) throw new UnauthorizedError('Invalid API token');
    if (tokenRecord.revokedAt) throw new UnauthorizedError('API token has been revoked');
    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedError('API token has expired');
    }

    const user = await this.config.findUser(tokenRecord.userId);
    if (!user) throw new UnauthorizedError('Token owner not found');

    // Touch last_used_at asynchronously (fire and forget)
    if (this.config.touchToken) {
      this.config.touchToken(tokenRecord.id).catch(() => {});
    }

    this._user = user;
    this._token = tokenRecord;
    return user;
  }

  public async silentCheck(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generates a new plain token and its SHA-256 hash.
   * Store hashedToken in DB, show plainToken once to the user.
   *
   * Hospital use: Generate integration token for LIS analyzer, TPA system.
   */
  public static generate(prefix = 'aero_'): GeneratedToken {
    const random = crypto.randomBytes(40).toString('hex');
    const plainToken = `${prefix}${random}`;
    const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
    return { plainToken, hashedToken, prefix };
  }
}
