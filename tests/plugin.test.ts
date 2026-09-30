import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { Aero, createPlugin } from '../src/index.js';

describe('Phase 8: Fastify-Style Plugin System and Encapsulation', () => {
  let app: Aero;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = new Aero({ debug: true });

    // 1. Root route
    app.get('/root', (ctx) => {
      ctx.json({
        root: true,
        secret: (app as any).childSecret ?? null,
      });
    });

    // 2. Encapsulated child plugin with prefix
    await app.register(
      async (child) => {
        child.decorate('childSecret', 'top-secret-123');

        child.use(async (ctx, next) => {
          ctx.set('X-Child-Plugin', 'scoped');
          await next();
        });

        child.get('/info', (ctx) => {
          ctx.json({
            secret: (child as any).childSecret,
            path: ctx.path,
          });
        });

        // Nested plugin inside child scope
        await child.register(
          async (nested) => {
            nested.get('/nested-info', (ctx) => {
              ctx.json({ nested: true, parentSecret: (nested as any).childSecret });
            });
          },
          { prefix: '/nested' }
        );
      },
      { prefix: '/v1' }
    );

    // 3. Plugin that breaks out of encapsulation using createPlugin (fastify-plugin style)
    const globalExtensionPlugin = createPlugin(async (rootApp) => {
      rootApp.decorate('sharedUtility', () => 'shared-result');
    });

    await app.register(globalExtensionPlugin);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps decorators encapsulated to the child plugin', async () => {
    // Child decorator does not leak to root app
    expect((app as any).childSecret).toBeUndefined();

    // Root route confirms it cannot see childSecret
    const res = await fetch(`${baseUrl}/root`);
    const body = await res.json();
    expect(body.secret).toBeNull();
    // Middleware did not leak
    expect(res.headers.get('x-child-plugin')).toBeNull();
  });

  it('applies prefix, scoped middleware, and decorators to child plugin routes', async () => {
    const res = await fetch(`${baseUrl}/v1/info`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-child-plugin')).toBe('scoped');

    const body = await res.json();
    expect(body.secret).toBe('top-secret-123');
    expect(body.path).toBe('/v1/info');
  });

  it('supports nested plugins with concatenated prefixes and inherited parent context', async () => {
    const res = await fetch(`${baseUrl}/v1/nested/nested-info`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nested).toBe(true);
    expect(body.parentSecret).toBe('top-secret-123');
  });

  it('allows plugins using createPlugin to break out of encapsulation', () => {
    expect(typeof (app as any).sharedUtility).toBe('function');
    expect((app as any).sharedUtility()).toBe('shared-result');
  });
});
