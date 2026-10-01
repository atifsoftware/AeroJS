/**
 * @file jwt-guard.ts
 * @description JWT Authentication Guard for AeroJS.
 * Stateless authentication for Doctor Portal API, Mobile App, and external FHIR/HL7 integrations.
 * Hospital use: Doctor's mobile ward-round app authenticates via Bearer JWT token.
 */

import type { AeroContext } from '../../core/context.js';
import type { GuardContract, AuthUser } from './guard.js';
import { verify, sign, type JwtSignOptions } from '../../security/jwt.js';
import { UnauthorizedError } from '../../core/errors.js';

export interface JwtGuardConfig {
  /**
   * Secret key for signing/verifying tokens. Use a long random string in production.
   */
  secret: string;

  /**
   * Token expiry. Default: '8h' (one hospital shift).
   */
  expiresIn?: string | number;

  /**
   * Callback to fetch user by ID (sub claim) from your database.
   */
  provider: (id: string | number) => Promise<AuthUser | null>;

  /**
   * Where to extract the token from. Default: Authorization header.
   */
  extractFrom?: 'header' | 'cookie' | 'query';

  /**
   * Cookie name if extractFrom = 'cookie'. Default: 'aero_token'.
   */
  cookieName?: string;

  /**
   * Query parameter name if extractFrom = 'query'. Default: 'token'.
   */
  queryParam?: string;
}

export interface JwtTokenPair {
  accessToken: string;
  expiresIn: number | string;
  tokenType: 'Bearer';
}

export class JwtGuard implements GuardContract {
  private _user: AuthUser | null = null;
  private _checked = false;
  private readonly config: JwtGuardConfig;
  private ctx: AeroContext;

  constructor(ctx: AeroContext, config: JwtGuardConfig) {
    this.ctx = ctx;
    this.config = config;
  }

  public user(): AuthUser | null {
    return this._user;
  }

  public check(): boolean {
    return this._user !== null;
  }

  /**
   * Extracts the raw token string from the request.
   */
  private extractToken(): string | null {
    const { extractFrom = 'header', cookieName = 'aero_token', queryParam = 'token' } = this.config;

    if (extractFrom === 'cookie') {
      return this.ctx.cookies[cookieName] ?? null;
    }

    if (extractFrom === 'query') {
      return (this.ctx.query[queryParam] as string) ?? null;
    }

    // Default: Authorization: Bearer <token>
    const authHeader = this.ctx.req.get('authorization');
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !/^Bearer$/i.test(parts[0]!)) return null;
    return parts[1] ?? null;
  }

  /**
   * Verifies the JWT token and loads the user from the provider.
   */
  public async authenticate(): Promise<AuthUser> {
    if (this._checked) {
      if (!this._user) throw new UnauthorizedError('Invalid or expired token');
      return this._user;
    }

    this._checked = true;
    const token = this.extractToken();

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    let payload: { sub?: string | number; [key: string]: unknown };
    try {
      payload = verify(token, this.config.secret) as typeof payload;
    } catch (err: any) {
      const msg = err?.name === 'TokenExpiredError' ? 'Token has expired. Please log in again.' : 'Invalid token';
      throw new UnauthorizedError(msg);
    }

    if (!payload.sub) {
      throw new UnauthorizedError('Token payload missing user identifier');
    }

    const user = await this.config.provider(payload.sub);
    if (!user) {
      throw new UnauthorizedError('Authenticated user not found');
    }

    this._user = user;
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
   * Generates a signed JWT token pair for a user.
   * Hospital use: Doctor logs in → receives { accessToken, expiresIn }.
   */
  public generate(user: AuthUser, options: JwtSignOptions = {}): JwtTokenPair {
    const expiresIn = options.expiresIn ?? this.config.expiresIn ?? '8h';
    const token = sign(
      {
        sub: String(user.id),
        role: user.role,
        branchId: user.branchId,
        ...user,
      },
      this.config.secret,
      { expiresIn, ...options }
    );

    return {
      accessToken: token,
      expiresIn,
      tokenType: 'Bearer',
    };
  }
}
