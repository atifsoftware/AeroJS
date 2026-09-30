import { describe, it, expect } from 'vitest';
import { securityHeaders } from '../src/security/headers.js';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Zero-Dependency Security Headers Module', () => {
  it('applies secure default headers', async () => {
    const app = new Aero();
    // Simulate an upstream framework header
    app.use(async (ctx, next) => {
      ctx.set('X-Powered-By', 'Aero');
      await next();
    });
    app.use(securityHeaders());
    app.get('/', (ctx) => ctx.send('hello security'));

    const client = createTestClient(app);
    const res = await client.get('/');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-xss-protection']).toBe('0');
    expect(res.headers['strict-transport-security']).toContain('max-age=15552000');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('supports custom frame options, HSTS preload, and CSP object directives', async () => {
    const app = new Aero();
    app.use(
      securityHeaders({
        frameOptions: 'DENY',
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        crossOriginEmbedderPolicy: 'require-corp',
        contentSecurityPolicy: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdn.example.com'],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: true,
        },
      })
    );

    app.get('/custom', (ctx) => ctx.send('custom security'));

    const client = createTestClient(app);
    const res = await client.get('/custom');

    expect(res.status).toBe(200);
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload'
    );
    expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');

    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' https://cdn.example.com");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('supports raw string CSP and disabling specific headers', async () => {
    const app = new Aero();
    app.use(
      securityHeaders({
        contentTypeOptions: false,
        referrerPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: "default-src 'none'",
      })
    );

    app.get('/disabled', (ctx) => ctx.send('selective'));

    const client = createTestClient(app);
    const res = await client.get('/disabled');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBeUndefined();
    expect(res.headers['referrer-policy']).toBeUndefined();
    expect(res.headers['cross-origin-opener-policy']).toBeUndefined();
    expect(res.headers['cross-origin-resource-policy']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBe("default-src 'none'");
  });
});
