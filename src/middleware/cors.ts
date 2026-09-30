/**
 * @file cors.ts
 * @description Zero-dependency Cross-Origin Resource Sharing (CORS) middleware for Aero.
 */

import type { Middleware } from '../core/types.js';
import type { DefaultState } from '../core/context.js';

export interface CorsOptions {
  origin?: string | string[] | boolean | ((origin: string) => boolean | string);
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
}

export function cors<State = DefaultState>(options: CorsOptions = {}): Middleware<State> {
  const defaultMethods = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];
  const methods = Array.isArray(options.methods)
    ? options.methods.join(', ')
    : options.methods ?? defaultMethods.join(', ');

  const credentials = Boolean(options.credentials);
  const maxAge = options.maxAge;

  return async (ctx, next) => {
    const requestOrigin = ctx.header('origin');

    if (!requestOrigin) {
      return next();
    }

    // Determine allowed origin
    let allowOrigin: string | null = null;
    const originOpt = options.origin ?? '*';

    if (typeof originOpt === 'function') {
      const res = originOpt(requestOrigin);
      if (typeof res === 'string') {
        allowOrigin = res;
      } else if (res === true) {
        allowOrigin = requestOrigin;
      }
    } else if (Array.isArray(originOpt)) {
      if (originOpt.includes(requestOrigin) || originOpt.includes('*')) {
        allowOrigin = requestOrigin;
      }
    } else if (typeof originOpt === 'string') {
      allowOrigin = originOpt;
    } else if (originOpt === true) {
      allowOrigin = requestOrigin;
    }

    if (allowOrigin) {
      ctx.set('Access-Control-Allow-Origin', allowOrigin);
      if (allowOrigin !== '*') {
        ctx.set('Vary', 'Origin');
      }
    }

    if (credentials) {
      ctx.set('Access-Control-Allow-Credentials', 'true');
    }

    if (options.exposedHeaders) {
      const exposed = Array.isArray(options.exposedHeaders)
        ? options.exposedHeaders.join(', ')
        : options.exposedHeaders;
      ctx.set('Access-Control-Expose-Headers', exposed);
    }

    // Handle preflight OPTIONS request
    if (ctx.method === 'OPTIONS') {
      ctx.set('Access-Control-Allow-Methods', methods);

      const requestHeaders = ctx.header('access-control-request-headers');
      if (options.allowedHeaders) {
        const allowed = Array.isArray(options.allowedHeaders)
          ? options.allowedHeaders.join(', ')
          : options.allowedHeaders;
        ctx.set('Access-Control-Allow-Headers', allowed);
      } else if (requestHeaders) {
        ctx.set('Access-Control-Allow-Headers', requestHeaders);
      }

      if (maxAge !== undefined && maxAge > 0) {
        ctx.set('Access-Control-Max-Age', String(maxAge));
      }

      return ctx.status(204).send(null);
    }

    await next();
  };
}
