/**
 * @file generator.ts
 * @description OpenAPI 3.0 specification generator for AeroJS.
 * Automatically scans registered routes, extracts path parameters, schemas, and security definitions.
 */

import type { Route, RouteSchema } from '../core/router.js';

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, any>>;
  components?: {
    securitySchemes?: Record<string, any>;
    schemas?: Record<string, any>;
  };
}

export interface SwaggerOptions {
  title?: string;
  version?: string;
  description?: string;
  openapiVersion?: string;
  route?: string; // Swagger UI endpoint, default '/docs'
  specRoute?: string; // OpenAPI JSON endpoint, default '/openapi.json'
  servers?: Array<{ url: string; description?: string }>;
  security?: boolean | Record<string, any>;
}

export class SwaggerGenerator {
  public static generate(routes: Route[], options: SwaggerOptions = {}): OpenAPISpec {
    const spec: OpenAPISpec = {
      openapi: options.openapiVersion || '3.0.3',

      info: {
        title: options.title || 'AeroJS Application API',
        version: options.version || '1.0.0',
        description: options.description || 'Interactive API documentation generated automatically by AeroJS.',
      },
      servers: options.servers || [{ url: '/', description: 'Current Server' }],
      paths: {},
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your JWT Bearer token',
          },
        },
      },
    };

    const tagsSet = new Set<string>();

    for (const route of routes) {
      // Don't document Swagger UI / internal docs routes
      if (route.path.startsWith('/docs') || route.path.startsWith('/openapi.json') || route.path.startsWith('/api-spec.json') || route.path.startsWith('/api-docs') || route.path.startsWith('/swagger')) {
        continue;
      }

      // Convert Aero path '/users/:id/posts/:slug' -> OpenAPI path '/users/{id}/posts/{slug}'
      const openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

      if (!spec.paths[openApiPath]) {
        spec.paths[openApiPath] = {};
      }

      const method = route.method.toLowerCase();
      if (method === 'all') continue;

      // Determine Tag
      const segments = route.path.split('/').filter(Boolean);
      const tagCandidate = segments[0] === 'api' ? segments[1] : segments[0];
      const defaultTag = tagCandidate
        ? tagCandidate.charAt(0).toUpperCase() + tagCandidate.slice(1)
        : 'General';

      // Extract Route OpenAPI Metadata
      const openapiMeta = (route as any).openapi || {};
      const tags = openapiMeta.tags || [defaultTag];
      for (const t of tags) tagsSet.add(t);

      // Extract Path Parameters
      const parameters: any[] = [];
      const paramMatches = [...route.path.matchAll(/:([a-zA-Z0-9_]+)/g)];
      for (const m of paramMatches) {
        parameters.push({
          name: m[1],
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: `Path parameter ${m[1]}`,
        });
      }

      // Extract Query Parameters from Route Schema
      const routeSchema: RouteSchema | undefined = (route as any).schema;
      if (routeSchema?.query && typeof routeSchema.query === 'object') {
        const props = (routeSchema.query as any).properties || {};
        const required = (routeSchema.query as any).required || [];
        for (const [key, propDef] of Object.entries(props)) {
          parameters.push({
            name: key,
            in: 'query',
            required: required.includes(key),
            schema: propDef,
          });
        }
      }

      // Request Body
      let requestBody: any = undefined;
      if (routeSchema?.body) {
        requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: routeSchema.body,
            },
          },
        };
      }

      // Responses
      const responses: Record<string, any> = {
        '200': {
          description: 'Successful Operation',
        },
      };

      if (routeSchema?.body || routeSchema?.query || routeSchema?.params) {
        responses['400'] = { description: 'Bad Request / Validation Failure' };
        responses['422'] = { description: 'Unprocessable Entity' };
      }

      const mergedResponses = { ...responses, ...(openapiMeta.responses || {}) };

      spec.paths[openApiPath]![method] = {
        tags,
        summary: openapiMeta.summary || `${route.method} ${route.path}`,
        description: openapiMeta.description,
        deprecated: openapiMeta.deprecated,
        parameters: parameters.length > 0 ? parameters : undefined,
        requestBody,
        responses: mergedResponses,
        security: options.security ? [{ bearerAuth: [] }] : undefined,
      };
    }


    spec.tags = Array.from(tagsSet).map((name) => ({ name }));
    return spec;
  }
}
