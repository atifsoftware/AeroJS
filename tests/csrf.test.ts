import { describe, it, expect } from 'vitest';
import { csrf } from '../src/security/csrf.js';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Zero-Dependency CSRF Module', () => {
  it('sets CSRF cookie on GET request and attaches csrfToken helper', async () => {
    const app = new Aero();
    app.use(csrf());
    app.get('/form', (ctx) => {
      ctx.send({ token: (ctx as any).csrfToken() });
    });

    const client = createTestClient(app);
    const res = await client.get('/form');

    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const token = res.json<any>().token;
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  it('allows safe methods without token', async () => {
    const app = new Aero();
    app.use(csrf());
    app.get('/safe', (ctx) => ctx.send('safe'));

    const client = createTestClient(app);
    const res = await client.get('/safe');
    expect(res.status).toBe(200);
  });

  it('rejects POST request without CSRF token with 403 Forbidden', async () => {
    const app = new Aero();
    app.use(csrf());
    app.post('/submit', (ctx) => ctx.send('submitted'));

    const client = createTestClient(app);
    const res = await client.post('/submit', {
      headers: {
        cookie: '_csrf=test-token-1234567890abcdef1234567890abcdef',
      },
    });

    expect(res.status).toBe(403);
    expect(res.json<any>().error.message).toContain('Invalid or missing CSRF token');
  });

  it('accepts POST request with valid CSRF header', async () => {
    const app = new Aero();
    app.use(csrf());
    app.post('/submit', (ctx) => ctx.send('submitted'));

    const client = createTestClient(app);
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const res = await client.post('/submit', {
      headers: {
        cookie: `_csrf=${token}`,
        'x-csrf-token': token,
      },
    });

    expect(res.status).toBe(200);
    expect(res.text()).toBe('submitted');
  });

  it('accepts POST request with valid CSRF body field', async () => {
    const app = new Aero();
    app.use(csrf());
    app.post('/submit', (ctx) => ctx.send('submitted'));

    const client = createTestClient(app);
    const token = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const res = await client.post('/submit', {
      headers: {
        'content-type': 'application/json',
        cookie: `_csrf=${token}`,
      },
      body: {
        _csrf: token,
        name: 'test',
      },
    });

    expect(res.status).toBe(200);
    expect(res.text()).toBe('submitted');
  });
});
