/**
 * @file fingerprint.ts
 * @description Client Request Fingerprinting and Anti-Session Hijacking protection for AeroJS.
 * Computes deterministic cryptographic hashes of client browser, network, and header signatures.
 */

import * as crypto from 'node:crypto';
import type { AeroContext } from '../core/context.js';
import type { Middleware } from '../core/types.js';

export interface FingerprintOptions {
  /**
   * Include client IP address in fingerprint. Default: true.
   */
  ip?: boolean;
  /**
   * Include User-Agent header. Default: true.
   */
  userAgent?: boolean;
  /**
   * Include Accept-Language header. Default: true.
   */
  acceptLanguage?: boolean;
  /**
   * Custom application salt for the hash.
   */
  salt?: string;
  /**
   * Additional header names to include in the signature.
   */
  additionalHeaders?: string[];
}

export class RequestFingerprint {
  /**
   * Generates a deterministic SHA-256 fingerprint hash of the request client traits.
   */
  public static generate(ctx: AeroContext, options: FingerprintOptions = {}): string {
    const includeIp = options.ip !== false;
    const includeUa = options.userAgent !== false;
    const includeLang = options.acceptLanguage !== false;
    const salt = options.salt || 'aero-fingerprint-salt';

    const components: string[] = [];

    if (includeUa) {
      const ua = ctx.req.headers['user-agent'];
      components.push(Array.isArray(ua) ? ua.join(',') : ua || 'unknown-ua');
    }

    if (includeLang) {
      const lang = ctx.req.headers['accept-language'];
      components.push(Array.isArray(lang) ? lang.join(',') : lang || 'unknown-lang');
    }

    if (includeIp) {
      // Resolve client IP from headers or request IP
      const forwarded = ctx.req.headers['x-forwarded-for'];
      const rawIp = typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : (ctx.ip || (ctx.req.raw as any)?.socket?.remoteAddress || '127.0.0.1');
      components.push(rawIp || '127.0.0.1');
    }

    if (options.additionalHeaders) {
      for (const h of options.additionalHeaders) {
        const val = ctx.req.headers[h.toLowerCase()];
        components.push(Array.isArray(val) ? val.join(',') : val || '');
      }
    }

    const payload = `${salt}::${components.join('||')}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Verifies whether an incoming request matches the expected fingerprint hash.
   */
  public static verify(ctx: AeroContext, expectedFingerprint: string, options: FingerprintOptions = {}): boolean {
    const current = this.generate(ctx, options);
    if (current.length !== expectedFingerprint.length) return false;
    return crypto.timingSafeEqual(Buffer.from(current), Buffer.from(expectedFingerprint));
  }
}

/**
 * Middleware that binds client fingerprinting to AeroContext and validates session integrity.
 * If session hijacking is detected (mismatched device fingerprint), access is rejected with 401.
 */
export function fingerprintGuard(options: FingerprintOptions & {
  onMismatch?: (ctx: AeroContext) => void | Promise<void>;
} = {}): Middleware {
  return async (ctx, next) => {
    const currentFingerprint = RequestFingerprint.generate(ctx, options);
    (ctx as any).fingerprint = currentFingerprint;

    // If session is active, bind and verify fingerprint
    const session = (ctx as any).session;
    if (session && typeof session.get === 'function') {
      const stored = await session.get('_fingerprint');
      if (!stored) {
        // First visit in this session -> bind fingerprint
        await session.put('_fingerprint', currentFingerprint);
      } else if (stored !== currentFingerprint) {
        // Anomaly / Session Hijack detected!
        if (options.onMismatch) {
          await options.onMismatch(ctx);
          return;
        }
        ctx.status(401).json({
          error: 'Unauthorized: Session fingerprint mismatch (Potential Session Hijack)',
        });
        return;
      }
    }

    await next();
  };
}
