/**
 * @file application.ts
 * @description Fullstack Aero framework application class extending ApplicationCore with
 * full-stack conveniences: static file serving, CORS, template view engines, Inertia.js,
 * rate limiting, and security headers.
 */

import { ApplicationCore, type HookMap, type HookName } from './application-core.js';
import type { DefaultState } from './context.js';
import { serveStatic, type StaticOptions } from '../static/static.js';
import { cors, type CorsOptions } from '../middleware/cors.js';
import { viewPlugin, type ViewDriver, type ViewEngine } from '../views/view.js';
import { inertiaPlugin, type InertiaConfig } from '../inertia/inertia.js';
import { rateLimit, type RateLimitOptions } from '../security/rate-limiter.js';
import { securityHeaders, type SecurityHeadersOptions } from '../security/headers.js';

export { ApplicationCore, type HookMap, type HookName } from './application-core.js';

/**
 * Aero Full-Stack Application class.
 * Inherits the high-performance core HTTP engine from ApplicationCore and layers
 * fullstack monolith, SPA, and security extensions on top.
 */
export class Aero<State = DefaultState> extends ApplicationCore<State> {
  /**
   * Serves static assets from a directory.
   */
  public serveStatic(
    prefixOrOptions: string | StaticOptions,
    rootDir?: string,
    options: Omit<StaticOptions, 'root' | 'prefix'> = {}
  ): this {
    if (typeof prefixOrOptions === 'string') {
      const opts: StaticOptions = {
        prefix: prefixOrOptions,
        root: rootDir!,
        ...options,
      };
      return this.use(serveStatic(opts));
    }
    return this.use(serveStatic(prefixOrOptions));
  }

  /**
   * Configures Cross-Origin Resource Sharing (CORS).
   */
  public useCors(options?: CorsOptions): this {
    return this.use(cors(options));
  }

  /**
   * Configures server-side template view engine (Edge.js, EJS, or custom).
   */
  public useViewEngine(driverOrEngine: ViewDriver | ViewEngine): this {
    return this.use(viewPlugin(driverOrEngine));
  }

  /**
   * Enables Inertia.js protocol for seamless React & Vue 3 full-stack SPAs.
   */
  public useInertia(config?: InertiaConfig): this {
    return this.use(inertiaPlugin(config));
  }

  /**
   * Enables zero-dependency memory-safe sliding/fixed-window Rate Limiter.
   */
  public useRateLimit(options?: RateLimitOptions): this {
    return this.use(rateLimit<State>(options));
  }

  /**
   * Enables zero-dependency Helmet-equivalent security headers.
   */
  public useSecurityHeaders(options?: SecurityHeadersOptions): this {
    return this.use(securityHeaders<State>(options));
  }
}

export default Aero;
