/**
 * @file csrf.ts
 * @description Zero-dependency CSRF protection middleware for Aero using cryptographic tokens.
 */

import crypto from 'node:crypto';
import type { Middleware, NextFunction } from '../core/types.js';
import type { AeroContext } from '../core/context.js';
import { ForbiddenError } from '../core/errors.js';

export interface CsrfOptions {
  cookieName?: string;
  headerName?: string;
  cookieOptions?: {
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    path?: string;
    secure?: boolean;
  };
  ignoredMethods?: string[];
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function csrf(options: CsrfOptions = {}): Middleware {
  const cookieName = options.cookieName || '_csrf';
  const headerName = (options.headerName || 'x-csrf-token').toLowerCase();
  const ignoredMethods = new Set(options.ignoredMethods || ['GET', 'HEAD', 'OPTIONS']);
  const cookieOpts = {
    httpOnly: false, // Must be readable by client JS for SPAs/forms unless using double-submit
    sameSite: 'lax' as const,
    path: '/',
    ...options.cookieOptions,
  };

  return async (ctx: AeroContext, next: NextFunction) => {
    let token = ctx.cookies[cookieName];

    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      ctx.res.setCookie(cookieName, token, cookieOpts);
    }

    // Attach csrfToken generator/getter to ctx
    (ctx as any).csrfToken = () => token;

    // Validate safe methods
    if (ignoredMethods.has(ctx.method)) {
      return next();
    }

    // Check incoming token from header or body
    const headerToken = ctx.req.get(headerName);
    const bodyToken =
      typeof ctx.body === 'object' && ctx.body !== null
        ? (ctx.body as Record<string, unknown>)['_csrf'] || (ctx.body as Record<string, unknown>)['csrf_token']
        : undefined;

    const providedToken = (headerToken || (typeof bodyToken === 'string' ? bodyToken : undefined));

    if (!providedToken || !timingSafeEqual(token, providedToken)) {
      throw new ForbiddenError('Invalid or missing CSRF token');
    }

    await next();
  };
}
