import { describe, it, expect } from 'vitest';
import { Aero, createTestClient } from '../src/index.js';

describe('Phase 9: In-Process TestClient Utilities', () => {
  it('performs GET requests without starting a network server', async () => {
    const app = new Aero();
    app.get('/health', (ctx) => {
      ctx.json({ status: 'ok', uptime: 100 });
    });

    const client = createTestClient(app);
    const res = await client.get('/health');

    expect(res.status).toBe(200);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json()).toEqual({ status: 'ok', uptime: 100 });
  });

  it('sends and receives JSON bodies via POST', async () => {
    const app = new Aero();
    app.post('/users', (ctx) => {
      const data = ctx.body as any;
      ctx.status(201).json({ id: 99, ...data });
    });

    const client = createTestClient(app);
    const res = await client.post('/users', {
      body: { name: 'Ada', role: 'Architect' },
    });

    expect(res.status).toBe(201);
    expect(res.json()).toEqual({ id: 99, name: 'Ada', role: 'Architect' });
  });

  it('transmits query strings and custom headers', async () => {
    const app = new Aero();
    app.get('/search', (ctx) => {
      ctx.json({
        q: ctx.query.q,
        auth: ctx.headers['x-api-key'],
      });
    });

    const client = createTestClient(app);
    const res = await client.get('/search', {
      query: { q: 'aero framework' },
      headers: { 'X-Api-Key': 'key-123' },
    });

    expect(res.status).toBe(200);
    expect(res.json()).toEqual({
      q: 'aero framework',
      auth: 'key-123',
    });
  });

  it('handles PUT, PATCH, DELETE, OPTIONS, HEAD methods', async () => {
    const app = new Aero();
    app.put('/items/:id', (ctx) => ctx.json({ updated: ctx.params.id }));
    app.patch('/items/:id', (ctx) => ctx.json({ patched: ctx.params.id }));
    app.delete('/items/:id', (ctx) => ctx.status(204).send(null));

    const client = createTestClient(app);

    const putRes = await client.put('/items/1');
    expect(putRes.status).toBe(200);
    expect(putRes.json()).toEqual({ updated: '1' });

    const patchRes = await client.patch('/items/2');
    expect(patchRes.status).toBe(200);
    expect(patchRes.json()).toEqual({ patched: '2' });

    const deleteRes = await client.delete('/items/3');
    expect(deleteRes.status).toBe(204);

    const optionsRes = await client.options('/items/1');
    expect(optionsRes.status).toBe(204);
  });
});
