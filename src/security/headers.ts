/**
 * @file headers.ts
 * @description Zero-dependency HTTP security headers middleware (Helmet-like) for Aero.
 */

import type { Middleware, NextFunction } from '../core/types.js';
import type { AeroContext, DefaultState } from '../core/context.js';

export interface HstsOptions {
  maxAge?: number; // seconds, default: 15552000 (180 days)
  includeSubDomains?: boolean; // default: true
  preload?: boolean; // default: false
}

export type ContentSecurityPolicyDirectives = Record<string, string | string[] | boolean>;

export interface SecurityHeadersOptions {
  /**
   * Prevents MIME type sniffing. Default: true ('nosniff')
   */
  contentTypeOptions?: boolean;

  /**
   * Clickjacking defense: 'DENY', 'SAMEORIGIN', or false to disable. Default: 'SAMEORIGIN'
   */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | false;

  /**
   * XSS Auditor protection header. Default: '0' (per modern security standards)
   */
  xssProtection?: string | boolean;

  /**
   * HTTP Strict Transport Security. Set to false to disable. Default: enabled
   */
  hsts?: HstsOptions | boolean;

  /**
   * Controls Referer header behavior. Default: 'no-referrer'
   */
  referrerPolicy?: string | false;

  /**
   * Cross-Origin-Opener-Policy header. Default: 'same-origin'
   */
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false;

  /**
   * Cross-Origin-Resource-Policy header. Default: 'same-origin'
   */
  crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin' | false;

  /**
   * Cross-Origin-Embedder-Policy header. Default: false
   */
  crossOriginEmbedderPolicy?: 'require-corp' | 'credentialless' | false;

  /**
   * Content Security Policy header. Directives object or raw string. Default: false
   */
  contentSecurityPolicy?: string | ContentSecurityPolicyDirectives | false;

  /**
   * Removes or hides the X-Powered-By header. Default: true
   */
  hidePoweredBy?: boolean;
}

function buildCsp(directives: ContentSecurityPolicyDirectives): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(directives)) {
    const directiveName = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    if (typeof value === 'boolean') {
      if (value) parts.push(directiveName);
    } else if (Array.isArray(value)) {
      parts.push(`${directiveName} ${value.join(' ')}`);
    } else if (typeof value === 'string') {
      parts.push(`${directiveName} ${value}`);
    }
  }

  return parts.join('; ');
}

export function securityHeaders<State = DefaultState>(options: SecurityHeadersOptions = {}): Middleware<State> {
  const {
    contentTypeOptions = true,
    frameOptions = 'SAMEORIGIN',
    xssProtection = '0',
    hsts = { maxAge: 15552000, includeSubDomains: true },
    referrerPolicy = 'no-referrer',
    crossOriginOpenerPolicy = 'same-origin',
    crossOriginResourcePolicy = 'same-origin',
    crossOriginEmbedderPolicy = false,
    contentSecurityPolicy = false,
    hidePoweredBy = true,
  } = options;

  return async (ctx: AeroContext<State>, next: NextFunction) => {
    // 1. Hide X-Powered-By
    if (hidePoweredBy) {
      ctx.res.removeHeader('X-Powered-By');
    }

    // 2. X-Content-Type-Options
    if (contentTypeOptions) {
      ctx.res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // 3. X-Frame-Options
    if (frameOptions) {
      ctx.res.setHeader('X-Frame-Options', frameOptions);
    }

    // 4. X-XSS-Protection
    if (xssProtection) {
      const val = typeof xssProtection === 'string' ? xssProtection : '0';
      ctx.res.setHeader('X-XSS-Protection', val);
    }

    // 5. Strict-Transport-Security (HSTS)
    if (hsts) {
      const opts: HstsOptions = typeof hsts === 'object' ? hsts : { maxAge: 15552000, includeSubDomains: true };
      const maxAge = opts.maxAge ?? 15552000;
      let val = `max-age=${maxAge}`;
      if (opts.includeSubDomains ?? true) {
        val += '; includeSubDomains';
      }
      if (opts.preload) {
        val += '; preload';
      }
      ctx.res.setHeader('Strict-Transport-Security', val);
    }

    // 6. Referrer-Policy
    if (referrerPolicy) {
      ctx.res.setHeader('Referrer-Policy', referrerPolicy);
    }

    // 7. Cross-Origin-Opener-Policy
    if (crossOriginOpenerPolicy) {
      ctx.res.setHeader('Cross-Origin-Opener-Policy', crossOriginOpenerPolicy);
    }

    // 8. Cross-Origin-Resource-Policy
    if (crossOriginResourcePolicy) {
      ctx.res.setHeader('Cross-Origin-Resource-Policy', crossOriginResourcePolicy);
    }

    // 9. Cross-Origin-Embedder-Policy
    if (crossOriginEmbedderPolicy) {
      ctx.res.setHeader('Cross-Origin-Embedder-Policy', crossOriginEmbedderPolicy);
    }

    // 10. Content-Security-Policy
    if (contentSecurityPolicy) {
      const cspVal =
        typeof contentSecurityPolicy === 'string'
          ? contentSecurityPolicy
          : buildCsp(contentSecurityPolicy);
      ctx.res.setHeader('Content-Security-Policy', cspVal);
    }

    await next();
  };
}
