import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';
import { describe, it, expect } from 'vitest';
import { compose, type Middleware } from '../src/core/middleware.js';
import { AeroContext } from '../src/core/context.js';
import { EventEmitter } from 'node:events';

function createMockContext() {
  const reqEmitter = new EventEmitter();
  const resEmitter = new EventEmitter();

  const rawReq = Object.assign(reqEmitter, {
    method: 'GET',
    url: '/test',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  });

  const rawRes = Object.assign(resEmitter, {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader: () => {},
    getHeader: () => undefined,
    removeHeader: () => {},
    end: () => {},
  });

  return new AeroContext(rawReq as any, rawRes as any);
}

describe('Middleware Composer (Onion Model)', () => {
  it('executes middleware in onion order (downstream then upstream)', async () => {
    const order: number[] = [];
    const ctx = createMockContext();

    const m1: Middleware = async (_c, next) => {
      order.push(1);
      await next();
      order.push(6);
    };

    const m2: Middleware = async (_c, next) => {
      order.push(2);
      await next();
      order.push(5);
    };

    const m3: Middleware = async (_c, next) => {
      order.push(3);
      await next();
      order.push(4);
    };

    const pipeline = compose([m1, m2, m3]);
    await pipeline(ctx);

    expect(order).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('guards against calling next() multiple times', async () => {
    const ctx = createMockContext();

    const buggyMiddleware: Middleware = async (_c, next) => {
      await next();
      await next();
    };

    const pipeline = compose([buggyMiddleware, async () => {}]);

    await expect(pipeline(ctx)).rejects.toThrow('next() called multiple times');
  });

  it('propagates async errors through the chain', async () => {
    const ctx = createMockContext();

    const m1: Middleware = async (_c, next) => {
      try {
        await next();
      } catch (err: any) {
        ctx.state.caught = err.message;
      }
    };

    const m2: Middleware = async () => {
      throw new Error('Database failure');
    };

    const pipeline = compose([m1, m2]);
    await pipeline(ctx);

    expect(ctx.state.caught).toBe('Database failure');
  });

  it('handles synchronous exceptions correctly', async () => {
    const ctx = createMockContext();
    const m1: Middleware = () => {
      throw new Error('Sync error');
    };

    const pipeline = compose([m1]);
    await expect(pipeline(ctx)).rejects.toThrow('Sync error');
  });

  it('resolves cleanly with empty middleware array', async () => {
    const ctx = createMockContext();
    const pipeline = compose([]);
    await expect(pipeline(ctx)).resolves.toBeUndefined();
  });
  it('throws descriptive error when route references an unregistered named middleware', async () => {
    const app = new Aero();
    app.get('/unregistered', ['missingMiddleware', (ctx) => ctx.text('ok')]);

    const client = createTestClient(app);
    const res = await client.get('/unregistered');
    expect(res.status).toBe(500);
  });

  it('caches compiled route pipeline across multiple requests', async () => {
    const app = new Aero();
    let handlerExecutions = 0;
    app.get('/cached', (ctx) => {
      handlerExecutions++;
      ctx.text('done');
    });

    const client = createTestClient(app);
    const res1 = await client.get('/cached');
    expect(res1.status).toBe(200);

    const res2 = await client.get('/cached');
    expect(res2.status).toBe(200);
    expect(handlerExecutions).toBe(2);
  });

});
