import { describe, it, expect, vi } from 'vitest';
import {
  rateLimit,
  MemoryRateLimitStore,
} from '../src/security/rate-limiter.js';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Zero-Dependency Rate Limiter Module', () => {
  describe('MemoryRateLimitStore', () => {
    it('increments hits and tracks resetTime', () => {
      const store = new MemoryRateLimitStore(5000);
      const res1 = store.increment('ip-1', 1000);
      expect(res1.totalHits).toBe(1);

      const res2 = store.increment('ip-1', 1000);
      expect(res2.totalHits).toBe(2);

      store.decrement('ip-1');
      store.decrement('non-existent');

      store.resetKey('ip-1');
      const res3 = store.increment('ip-1', 1000);
      expect(res3.totalHits).toBe(1);

      store.resetAll();
      store.destroy();
    });

    it('cleans up expired entries', async () => {
      const store = new MemoryRateLimitStore(50);
      store.increment('ip-temp', 20); // 20ms window
      await new Promise((r) => setTimeout(r, 40));
      store.cleanup();
      // Should start fresh after expiry
      const res = store.increment('ip-temp', 1000);
      expect(res.totalHits).toBe(1);
      store.destroy();
    });
  });

  describe('rateLimit middleware', () => {
    it('allows requests within the limit and sets rate limit headers', async () => {
      const app = new Aero();
      const store = new MemoryRateLimitStore(10000);
      app.use(
        rateLimit({
          windowMs: 5000,
          max: 3,
          store,
        })
      );

      app.get('/test', (ctx) => ctx.send('ok'));
      const client = createTestClient(app);

      // Request 1
      const res1 = await client.get('/test');
      expect(res1.status).toBe(200);
      expect(res1.headers['x-ratelimit-limit']).toBe('3');
      expect(res1.headers['x-ratelimit-remaining']).toBe('2');
      expect(res1.headers['x-ratelimit-reset']).toBeDefined();

      // Request 2
      const res2 = await client.get('/test');
      expect(res2.status).toBe(200);
      expect(res2.headers['x-ratelimit-remaining']).toBe('1');

      // Request 3
      const res3 = await client.get('/test');
      expect(res3.status).toBe(200);
      expect(res3.headers['x-ratelimit-remaining']).toBe('0');

      // Request 4 (Limit reached)
      const res4 = await client.get('/test');
      expect(res4.status).toBe(429);
      expect(res4.headers['x-ratelimit-remaining']).toBe('0');
      expect(res4.headers['retry-after']).toBeDefined();
      expect(res4.json<any>().error.message).toContain('Too many requests');

      store.destroy();
    });

    it('supports custom status code, custom message object, and disabling headers', async () => {
      const app = new Aero();
      const store = new MemoryRateLimitStore(10000);
      app.use(
        rateLimit({
          windowMs: 5000,
          max: 1,
          statusCode: 420,
          headers: false,
          message: { custom: 'Calm down!' },
          store,
        })
      );

      app.get('/custom', (ctx) => ctx.send('pass'));
      const client = createTestClient(app);

      const res1 = await client.get('/custom');
      expect(res1.status).toBe(200);
      expect(res1.headers['x-ratelimit-limit']).toBeUndefined();

      const res2 = await client.get('/custom');
      expect(res2.status).toBe(420);
      expect(res2.json<any>()).toEqual({ custom: 'Calm down!' });
      expect(res2.headers['x-ratelimit-limit']).toBeUndefined();

      store.destroy();
    });

    it('supports skip condition', async () => {
      const app = new Aero();
      const store = new MemoryRateLimitStore(10000);
      app.use(
        rateLimit({
          max: 1,
          store,
          skip: (ctx) => ctx.path === '/health',
        })
      );

      app.get('/health', (ctx) => ctx.send('healthy'));
      app.get('/api', (ctx) => ctx.send('api'));
      const client = createTestClient(app);

      // Hit health multiple times without limit
      await client.get('/health');
      await client.get('/health');
      const healthRes = await client.get('/health');
      expect(healthRes.status).toBe(200);

      // API still gets limited
      await client.get('/api');
      const apiRes = await client.get('/api');
      expect(apiRes.status).toBe(429);

      store.destroy();
    });

    it('supports custom keyGenerator and custom handler', async () => {
      const app = new Aero();
      const store = new MemoryRateLimitStore(10000);
      const customHandler = vi.fn((ctx) => {
        ctx.status(429).send('Custom rate limit handler reached');
      });

      app.use(
        rateLimit({
          max: 1,
          keyGenerator: (ctx) => ctx.query['apiKey'] as string || 'anonymous',
          handler: customHandler,
          store,
        })
      );

      app.get('/service', (ctx) => ctx.send('ok'));
      const client = createTestClient(app);

      // Key A
      await client.get('/service?apiKey=keyA');
      const resA2 = await client.get('/service?apiKey=keyA');
      expect(resA2.status).toBe(429);
      expect(resA2.text()).toBe('Custom rate limit handler reached');
      expect(customHandler).toHaveBeenCalled();

      // Key B is unaffected
      const resB1 = await client.get('/service?apiKey=keyB');
      expect(resB1.status).toBe(200);

      store.destroy();
    });
  });
});
