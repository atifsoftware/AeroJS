/**
 * @file jwt.ts
 * @description Zero-dependency JSON Web Token (JWT) signing, verification, and authentication middleware for Aero.
 * Powered purely by Node.js built-in `node:crypto`.
 */

import crypto from 'node:crypto';
import type { Middleware } from '../core/types.js';
import type { AeroContext } from '../core/context.js';
import { UnauthorizedError } from '../core/errors.js';

export type JwtAlgorithm = 'HS256' | 'HS384' | 'HS512';

export interface JwtHeader {
  alg: JwtAlgorithm;
  typ?: string;
  [key: string]: unknown;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface JwtSignOptions {
  algorithm?: JwtAlgorithm;
  expiresIn?: string | number; // e.g., '1h', '7d', 3600 (seconds)
  notBefore?: string | number;
  audience?: string | string[];
  issuer?: string;
  subject?: string;
  jwtid?: string;
  header?: Record<string, unknown>;
  noTimestamp?: boolean;
}

export interface JwtVerifyOptions {
  algorithms?: JwtAlgorithm[];
  audience?: string | string[];
  issuer?: string | string[];
  subject?: string;
  clockTolerance?: number; // tolerance in seconds
  ignoreExpiration?: boolean;
  ignoreNotBefore?: boolean;
}

export interface JwtAuthOptions {
  secret: string | Buffer | ((header: JwtHeader, payload: JwtPayload) => Promise<string | Buffer> | string | Buffer);
  algorithms?: JwtAlgorithm[];
  credentialsRequired?: boolean; // default: true
  userProperty?: string; // default: 'user' (attaches to ctx.state.user)
  getToken?: (ctx: AeroContext) => string | undefined | null | Promise<string | undefined | null>;
  cookie?: string; // name of cookie containing the token
}

export class JsonWebTokenError extends Error {
  public override name = 'JsonWebTokenError';
  constructor(message: string) {
    super(message);
  }
}

export class TokenExpiredError extends JsonWebTokenError {
  public override name = 'TokenExpiredError';
  public expiredAt: Date;

  constructor(message: string, expiredAt: Date) {
    super(message);
    this.expiredAt = expiredAt;
  }
}

export class NotBeforeError extends JsonWebTokenError {
  public override name = 'NotBeforeError';
  public date: Date;

  constructor(message: string, date: Date) {
    super(message);
    this.date = date;
  }
}

const ALG_HASH_MAP: Record<JwtAlgorithm, string> = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512',
};

/**
 * Parses timespan string (e.g. '15m', '2h', '7d') or numeric seconds into seconds.
 */
export function parseTimespan(val: string | number): number {
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) {
      throw new JsonWebTokenError(`Invalid timespan numeric value: ${val}`);
    }
    return Math.floor(val);
  }

  const match = /^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hrs?|hours?|d|days?|w|weeks?|y|years?)?$/i.exec(val.trim());
  if (!match) {
    throw new JsonWebTokenError(`Invalid timespan format: "${val}"`);
  }

  const amount = parseInt(match[1]!, 10);
  const unit = (match[2] || 's').toLowerCase();

  if (unit.startsWith('s')) return amount;
  if (unit.startsWith('m') && !unit.startsWith('mo')) return amount * 60;
  if (unit.startsWith('h')) return amount * 3600;
  if (unit.startsWith('d')) return amount * 86400;
  if (unit.startsWith('w')) return amount * 604800;
  if (unit.startsWith('y')) return amount * 31536000;

  return amount;
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSignature(input: string, secret: string | Buffer, alg: JwtAlgorithm): string {
  const hashAlg = ALG_HASH_MAP[alg];
  if (!hashAlg) {
    throw new JsonWebTokenError(`Unsupported algorithm: ${alg}`);
  }
  return crypto.createHmac(hashAlg, secret).update(input).digest('base64url');
}

/**
 * Signs a payload and returns a signed JWT token string.
 */
export function sign(
  payload: Record<string, unknown>,
  secret: string | Buffer,
  options: JwtSignOptions = {}
): string {
  if (!secret) {
    throw new JsonWebTokenError('Secret key must be provided');
  }

  const alg = options.algorithm || 'HS256';
  if (!ALG_HASH_MAP[alg]) {
    throw new JsonWebTokenError(`Unsupported algorithm: ${alg}`);
  }

  const header: JwtHeader = {
    alg,
    typ: 'JWT',
    ...options.header,
  };

  const finalPayload: JwtPayload = { ...payload };
  const nowInSec = Math.floor(Date.now() / 1000);

  if (!options.noTimestamp && finalPayload.iat === undefined) {
    finalPayload.iat = nowInSec;
  }

  if (options.expiresIn !== undefined) {
    const diffSec = parseTimespan(options.expiresIn);
    finalPayload.exp = (finalPayload.iat ?? nowInSec) + diffSec;
  }

  if (options.notBefore !== undefined) {
    const diffSec = parseTimespan(options.notBefore);
    finalPayload.nbf = (finalPayload.iat ?? nowInSec) + diffSec;
  }

  if (options.audience !== undefined) {
    finalPayload.aud = options.audience;
  }

  if (options.issuer !== undefined) {
    finalPayload.iss = options.issuer;
  }

  if (options.subject !== undefined) {
    finalPayload.sub = options.subject;
  }

  if (options.jwtid !== undefined) {
    finalPayload.jti = options.jwtid;
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(finalPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSignature(signingInput, secret, alg);

  return `${signingInput}.${signature}`;
}

/**
 * Decodes a JWT token without verifying the signature.
 */
export function decode<T = JwtPayload>(
  token: string
): { header: JwtHeader; payload: T; signature: string } | null {
  if (typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]!)) as JwtHeader;
    const payload = JSON.parse(base64UrlDecode(parts[1]!)) as T;
    const signature = parts[2]!;
    return { header, payload, signature };
  } catch {
    return null;
  }
}

/**
 * Cryptographically verifies a JWT token and returns its decoded payload.
 */
export function verify<T = JwtPayload>(
  token: string,
  secret: string | Buffer,
  options: JwtVerifyOptions = {}
): T {
  if (typeof token !== 'string' || !token) {
    throw new JsonWebTokenError('jwt must be provided');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JsonWebTokenError('jwt malformed');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new JsonWebTokenError('jwt malformed');
  }

  let header: JwtHeader;
  let payload: JwtPayload;

  try {
    header = JSON.parse(base64UrlDecode(encodedHeader)) as JwtHeader;
  } catch {
    throw new JsonWebTokenError('invalid token header');
  }

  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
  } catch {
    throw new JsonWebTokenError('invalid token payload');
  }

  // Algorithm check
  const allowedAlgs = options.algorithms || ['HS256', 'HS384', 'HS512'];
  if (!allowedAlgs.includes(header.alg)) {
    throw new JsonWebTokenError(`invalid algorithm: ${header.alg}`);
  }

  // Signature verification (timing safe)
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSig = createSignature(signingInput, secret, header.alg);

  if (!timingSafeEqual(signature, expectedSig)) {
    throw new JsonWebTokenError('invalid signature');
  }

  const clockTolerance = options.clockTolerance ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);

  // Expiration check
  if (!options.ignoreExpiration && payload.exp !== undefined) {
    if (typeof payload.exp !== 'number') {
      throw new JsonWebTokenError('invalid exp claim');
    }
    if (nowSec >= payload.exp + clockTolerance) {
      throw new TokenExpiredError(
        'jwt expired',
        new Date(payload.exp * 1000)
      );
    }
  }

  // Not Before check
  if (!options.ignoreNotBefore && payload.nbf !== undefined) {
    if (typeof payload.nbf !== 'number') {
      throw new JsonWebTokenError('invalid nbf claim');
    }
    if (nowSec < payload.nbf - clockTolerance) {
      throw new NotBeforeError(
        'jwt not active',
        new Date(payload.nbf * 1000)
      );
    }
  }

  // Audience check
  if (options.audience !== undefined) {
    const expectedAudiences = Array.isArray(options.audience) ? options.audience : [options.audience];
    const payloadAudience = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    const match = expectedAudiences.some((ea) => payloadAudience.includes(ea));
    if (!match) {
      throw new JsonWebTokenError(`jwt audience invalid. expected: ${expectedAudiences.join(', ')}`);
    }
  }

  // Issuer check
  if (options.issuer !== undefined) {
    const expectedIssuers = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
    if (!payload.iss || !expectedIssuers.includes(payload.iss)) {
      throw new JsonWebTokenError(`jwt issuer invalid. expected: ${expectedIssuers.join(', ')}`);
    }
  }

  // Subject check
  if (options.subject !== undefined) {
    if (payload.sub !== options.subject) {
      throw new JsonWebTokenError(`jwt subject invalid. expected: ${options.subject}`);
    }
  }

  return payload as T;
}

export const jwt = {
  sign,
  verify,
  decode,
  parseTimespan,
};

/**
 * Aero Middleware for zero-dependency JWT authentication.
 */
export function jwtAuth<T = JwtPayload>(options: JwtAuthOptions): Middleware {
  const credentialsRequired = options.credentialsRequired ?? true;
  const userProperty = options.userProperty || 'user';

  return async (ctx: AeroContext, next) => {
    let token: string | undefined | null = null;

    // 1. Custom extractor
    if (options.getToken) {
      token = await options.getToken(ctx);
    }

    // 2. Authorization header: "Bearer <token>"
    if (!token) {
      const authHeader = ctx.req.get('authorization');
      if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && /^Bearer$/i.test(parts[0]!)) {
          token = parts[1];
        }
      }
    }

    // 3. Cookie extraction
    if (!token && options.cookie) {
      token = ctx.cookies[options.cookie];
    }

    // If no token was found
    if (!token) {
      if (credentialsRequired) {
        throw new UnauthorizedError('No authorization token was found');
      }
      return next();
    }

    // Resolve secret
    let secretKey: string | Buffer;
    if (typeof options.secret === 'function') {
      const decoded = decode(token);
      if (!decoded) {
        throw new UnauthorizedError('Malformed token');
      }
      secretKey = await options.secret(decoded.header, decoded.payload);
    } else {
      secretKey = options.secret;
    }

    try {
      const verifiedPayload = verify<T>(token, secretKey, {
        algorithms: options.algorithms,
      });

      // Attach to context state and context directly
      ctx.state[userProperty] = verifiedPayload;
      (ctx as unknown as Record<string, unknown>)[userProperty] = verifiedPayload;

      await next();
    } catch (err) {
      if (credentialsRequired) {
        const msg = err instanceof Error ? err.message : 'Invalid or expired token';
        throw new UnauthorizedError(msg);
      }
      await next();
    }
  };
}
