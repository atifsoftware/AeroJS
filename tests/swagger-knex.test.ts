import { describe, it, expect, beforeEach } from 'vitest';
import {
  Aero,
  DB,
  KnexDatabaseAdapter,
  useKnex,
  SwaggerGenerator,
} from '../src/index.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('AeroJS Knex Integration & Swagger / OpenAPI 3.0', () => {
  beforeEach(async () => {
    await DB.closeAll();
  });

  describe('Knex.js Integration', () => {
    it('bridges Knex raw queries and dialect row extraction to Aero DatabaseAdapter', async () => {
      // Create a mock Knex instance
      const mockRawQueries: Array<{ sql: string; bindings: any[] }> = [];
      const mockKnex = {
        raw: async (sql: string, bindings: any[] = []) => {
          mockRawQueries.push({ sql, bindings });
          if (sql.includes('SELECT')) {
            return [
              { id: 1, name: 'Alice Knex', role: 'admin' },
              { id: 2, name: 'Bob Knex', role: 'developer' },
            ];
          }
          return { insertId: 101, affectedRows: 1 };
        },
        destroy: async () => {},
      };

      const adapter = useKnex(mockKnex);
      expect(adapter).toBeInstanceOf(KnexDatabaseAdapter);
      expect((DB as any).knex).toBe(mockKnex);

      // Query via Aero DB table
      const users = await DB.table('users').where('role', 'admin').get();
      expect(users).toHaveLength(2);
      expect(users[0]?.name).toBe('Alice Knex');
      expect(mockRawQueries.length).toBeGreaterThan(0);
      expect(mockRawQueries[0]?.sql).toContain('SELECT * FROM users');
    });

    it('injects Knex into IoC container and makes it accessible on ctx.knex', async () => {
      const app = new Aero();
      const mockKnex = {
        raw: async (sql: string) => [{ version: 'PostgreSQL 16.1' }],
      };

      app.useKnex(mockKnex);

      app.get('/db-version', (ctx) => {
        expect(ctx.knex).toBe(mockKnex);
        ctx.status(200).json({ connected: true });
      });

      const client = createTestClient(app);
      const res = await client.get('/db-version');
      expect(res.status).toBe(200);
      expect(res.json().connected).toBe(true);
    });
  });

  describe('Swagger / OpenAPI 3.0 Documentation', () => {
    it('generates OpenAPI 3.0 specification from Aero routes and schemas', () => {
      const routes = [
        {
          method: 'GET',
          path: '/api/users/:id',
          schema: {
            query: {
              type: 'object',
              properties: {
                includeProfile: { type: 'boolean' },
              },
            },
          },
          handler: () => {},
        },
        {
          method: 'POST',
          path: '/api/users',
          schema: {
            body: {
              type: 'object',
              required: ['username', 'email'],
              properties: {
                username: { type: 'string' },
                email: { type: 'string', format: 'email' },
              },
            },
          },
          handler: () => {},
        },
      ];

      const spec = SwaggerGenerator.generate(routes as any, {
        title: 'Platform Core API',
        version: '2.0.0',
        security: true,
      });

      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('Platform Core API');
      expect(spec.info.version).toBe('2.0.0');

      // Path conversion: /api/users/:id -> /api/users/{id}
      expect(spec.paths['/api/users/{id}']).toBeDefined();
      const getOp = spec.paths['/api/users/{id}']!['get'];
      expect(getOp.tags).toContain('Users');
      expect(getOp.parameters).toHaveLength(2); // 1 path param + 1 query param
      expect(getOp.parameters[0].name).toBe('id');
      expect(getOp.parameters[0].in).toBe('path');
      expect(getOp.parameters[1].name).toBe('includeProfile');
      expect(getOp.parameters[1].in).toBe('query');

      // Request Body
      const postOp = spec.paths['/api/users']!['post'];
      expect(postOp.requestBody).toBeDefined();
      expect(postOp.requestBody.content['application/json'].schema.required).toContain('username');

      // Security Bearer Scheme
      expect(spec.components?.securitySchemes?.bearerAuth).toBeDefined();
    });

    it('mounts OpenAPI JSON and interactive Swagger UI HTML via app.useSwagger()', async () => {
      const app = new Aero();

      app.useSwagger({
        title: 'Aero Test API',
        version: '1.0.0',
        route: '/docs',
        specRoute: '/openapi.json',
      });

      app.get('/api/articles/:slug', (ctx) => {
        ctx.status(200).json({ slug: ctx.params.slug });
      });

      const client = createTestClient(app);

      // 1. GET /openapi.json -> Returns OpenAPI 3.0 spec JSON
      const specRes = await client.get('/openapi.json');
      expect(specRes.status).toBe(200);
      expect(specRes.headers['content-type']).toContain('application/json');
      const specJson = specRes.json();
      expect(specJson.openapi).toBe('3.0.3');
      expect(specJson.paths['/api/articles/{slug}']).toBeDefined();

      // 2. GET /docs -> Returns Swagger UI HTML page
      const docsRes = await client.get('/docs');
      expect(docsRes.status).toBe(200);
      expect(docsRes.headers['content-type']).toContain('text/html');
      const html = docsRes.text();
      expect(html).toContain('SwaggerUIBundle');
      expect(html).toContain('/openapi.json');
      expect(html).toContain('Aero Test API');
    });
  });
});
