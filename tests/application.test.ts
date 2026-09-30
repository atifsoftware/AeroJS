import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'node:http';
import { Aero, ApplicationCore, createTestClient } from '../src/index.js';

describe('Aero Application Core', () => {
  let app: Aero;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = new Aero({ debug: true });

    app.use(async (ctx, next) => {
      ctx.set('X-Global-Middleware', 'applied');
      await next();
    });

    app.get('/', (ctx) => {
      ctx.json({ framework: 'Aero', status: 'online' });
    });

    app.get('/hello/:name', (ctx) => {
      ctx.text(`Hello ${ctx.params.name}`);
    });

    app.get('/users/:id/posts/:postId', (ctx) => {
      ctx.json({
        id: ctx.params.id,
        postId: ctx.params.postId,
        query: ctx.query,
      });
    });

    app.get('/boom', (ctx) => {
      ctx.throw(500, 'Test error');
    });

    app.post('/items', (ctx) => {
      ctx.status(201).json({ created: true });
    });

    app.post('/echo-json', (ctx) => {
      ctx.status(200).json({ received: ctx.body });
    });

    app.post('/echo-form', (ctx) => {
      ctx.status(200).json({ form: ctx.body });
    });

    app.post('/echo-text', (ctx) => {
      ctx.text(`Echo: ${ctx.body}`);
    });

    app.get('/auto-send-buffer', (ctx) => {
      ctx.send(Buffer.from('binary'));
    });

    app.get('/auto-send-html', (ctx) => {
      ctx.send('<h1>Aero</h1>');
    });

    app.get('/redirect-me', (ctx) => {
      ctx.redirect('/target');
    });

    app.get('/target', (ctx) => {
      ctx.text('arrived');
    });

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

  it('GET / returns 200 with JSON payload and middleware header', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-global-middleware')).toBe('applied');

    const body = await res.json();
    expect(body).toEqual({ framework: 'Aero', status: 'online' });
  });

  it('GET /hello/:name extracts route parameter', async () => {
    const res = await fetch(`${baseUrl}/hello/Architect`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('Hello Architect');
  });

  it('GET /users/:id/posts/:postId extracts multiple parameters and query string', async () => {
    const res = await fetch(`${baseUrl}/users/10/posts/99?tag=ts`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: '10',
      postId: '99',
      query: { tag: 'ts' },
    });
  });

  it('GET /boom returns 500 formatted JSON error', async () => {
    const res = await fetch(`${baseUrl}/boom`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe('Test error');
    expect(body.error.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.stack).toBeDefined();
  });

  it('POST /items returns 201', async () => {
    const res = await fetch(`${baseUrl}/items`, { method: 'POST' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ created: true });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/not-found`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 405 Method Not Allowed with Allow header', async () => {
    const res = await fetch(`${baseUrl}/hello/test`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('GET');
    const body = await res.json();
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('responds to OPTIONS with Allow header', async () => {
    const res = await fetch(`${baseUrl}/hello/test`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('allow')).toContain('GET');
  });

  it('HEAD request returns headers without body', async () => {
    const res = await fetch(`${baseUrl}/hello/test`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('');
  });

  it('parses JSON request body', async () => {
    const res = await fetch(`${baseUrl}/echo-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ framework: 'Aero', speed: 'fast' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toEqual({ framework: 'Aero', speed: 'fast' });
  });

  it('parses URL-encoded form request body', async () => {
    const res = await fetch(`${baseUrl}/echo-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'title=Hello&count=42',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.form).toEqual({ title: 'Hello', count: '42' });
  });

  it('parses plain text request body', async () => {
    const res = await fetch(`${baseUrl}/echo-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'Sample Payload',
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('Echo: Sample Payload');
  });

  it('auto-detects buffer and html in ctx.send()', async () => {
    const bufRes = await fetch(`${baseUrl}/auto-send-buffer`);
    expect(bufRes.headers.get('content-type')).toBe('application/octet-stream');
    const bufText = await bufRes.text();
    expect(bufText).toBe('binary');

    const htmlRes = await fetch(`${baseUrl}/auto-send-html`);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');
  });

  it('handles redirect in ctx.redirect()', async () => {
    const res = await fetch(`${baseUrl}/redirect-me`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/target');
  });

  it('supports app.useSecurityHeaders() and app.useRateLimit() directly', async () => {
    const testApp = new Aero();
    testApp.useSecurityHeaders().useRateLimit({ max: 5 });
    testApp.get('/secured', (ctx) => ctx.send('secure-ok'));

    const client = createTestClient(testApp);
    const res = await client.get('/secured');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.text()).toBe('secure-ok');
  });

  it('registers ws route and onUpgrade hooks on app', () => {
    const testApp = new Aero();
    const wsHandler = vi.fn();
    const upgradeHandler = vi.fn();

    testApp.ws('/live', wsHandler);
    testApp.onUpgrade(upgradeHandler);

    expect(testApp).toBeDefined();
  });

  it('instantiates and operates standalone ApplicationCore without fullstack extensions', async () => {
    const core = new ApplicationCore();
    core.get('/core-ping', (ctx) => ctx.send('core-pong'));
    const client = createTestClient(core as any);
    const res = await client.get('/core-ping');
    expect(res.status).toBe(200);
    expect(res.text()).toBe('core-pong');
  });
});
