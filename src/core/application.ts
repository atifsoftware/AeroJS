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

  /**
   * Configures Knex as the underlying database query engine and registers it in IoC container.
   */
  public useKnex(knexInstance: any, connectionName = 'default'): this {
    import('../database/knex.js').then(({ useKnex: connectKnex }) => {
      connectKnex(knexInstance, connectionName);
    });
    this.container.bind('knex', () => knexInstance);
    return this;
  }

  /**
   * Configures OpenAPI 3.0 specification endpoint and interactive Swagger UI documentation.
   */
  public useSwagger(options: {
    title?: string;
    version?: string;
    description?: string;
    route?: string;
    specRoute?: string;
    security?: boolean | Record<string, any>;
  } = {}): this {
    const uiRoute = options.route || '/docs';
    const specRoute = options.specRoute || '/openapi.json';

    this.get(specRoute, async (ctx) => {
      const { SwaggerGenerator } = await import('../swagger/generator.js');
      const spec = SwaggerGenerator.generate(this.router.routes, options);
      ctx.status(200).json(spec);
    });

    this.get(uiRoute, async (ctx) => {
      const { renderSwaggerUI } = await import('../swagger/ui.js');
      const html = renderSwaggerUI({
        title: options.title || 'AeroJS API Documentation',
        specUrl: specRoute,
      });
      ctx.status(200).html(html);
    });

    return this;
  }

  /**
   * Configures Prisma Client as an ORM in Aero, binding it to IoC container and ctx.prisma.
   */
  public usePrisma(prismaClient: any): this {
    import('../database/prisma.js').then(({ usePrisma: connectPrisma }) => {
      connectPrisma(prismaClient);
    });
    this.container.bind('prisma', () => prismaClient);
    return this;
  }

  /**
   * Configures Drizzle ORM in Aero, binding it to IoC container and ctx.drizzle.
   */
  public useDrizzle(drizzleDb: any): this {
    import('../database/drizzle.js').then(({ useDrizzle: connectDrizzle }) => {
      connectDrizzle(drizzleDb);
    });
    this.container.bind('drizzle', () => drizzleDb);
    return this;
  }
}

export default Aero;
