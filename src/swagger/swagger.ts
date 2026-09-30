/**
 * @file swagger.ts
 * @description Swagger middleware and plugin for AeroJS.
 * Mounts interactive Swagger UI and OpenAPI 3.0 JSON specification endpoints.
 */

import type { Middleware } from '../core/types.js';
import { SwaggerGenerator, type SwaggerOptions, type OpenAPISpec } from './generator.js';
import { renderSwaggerUI } from './ui.js';

export function swaggerPlugin(options: SwaggerOptions = {}): Middleware {
  const uiRoute = options.route || '/docs';
  const specRoute = options.specRoute || '/openapi.json';

  let cachedSpec: OpenAPISpec | null = null;

  return async (ctx, next) => {
    // 1. Serve OpenAPI 3.0 JSON Specification
    if (ctx.method === 'GET' && ctx.path === specRoute) {
      const routes = (ctx.req as any)._app?.router?.routes || [];
      cachedSpec = SwaggerGenerator.generate(routes, options);
      ctx.status(200).json(cachedSpec);
      return;
    }

    // 2. Serve Interactive Swagger UI HTML Page
    if (ctx.method === 'GET' && (ctx.path === uiRoute || ctx.path === `${uiRoute}/`)) {
      const html = renderSwaggerUI({
        title: options.title || 'AeroJS API Docs',
        specUrl: specRoute,
      });
      ctx.status(200).html(html);
      return;
    }

    await next();
  };
}
