import { describe, it, expect } from 'vitest';
import { Aero } from '../src/index.js';

describe('Lifecycle Hooks', () => {
  it('fires lifecycle hooks in the correct order', async () => {
    const app = new Aero();
    const sequence: string[] = [];

    app.addHook('onRequest', () => {
      sequence.push('onRequest');
    });

    app.addHook('preHandler', () => {
      sequence.push('preHandler');
    });

    app.addHook('preSerialization', (_ctx, payload) => {
      sequence.push('preSerialization');
      return payload;
    });

    app.addHook('onSend', (_ctx, payload) => {
      sequence.push('onSend');
      return payload;
    });

    app.addHook('onResponse', () => {
      sequence.push('onResponse');
    });

    app.get('/test', (ctx) => {
      sequence.push('handler');
      ctx.json({ ok: true });
    });

    const server = await app.listenAsync(0, '127.0.0.1');
    const addr = server.address() as any;
    const url = `http://127.0.0.1:${addr.port}/test`;

    try {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(sequence).toEqual([
        'onRequest',
        'preHandler',
        'handler',
        'preSerialization',
        'onSend',
        'onResponse',
      ]);
    } finally {
      await app.close();
    }
  });

  it('triggers onError hook when an error is thrown', async () => {
    const app = new Aero();
    let caughtError: string | null = null;

    app.addHook('onError', (err) => {
      caughtError = err.message;
    });

    app.get('/fail', (ctx) => {
      ctx.throw(500, 'Hook failure test');
    });

    const server = await app.listenAsync(0, '127.0.0.1');
    const addr = server.address() as any;

    try {
      const res = await fetch(`http://127.0.0.1:${addr.port}/fail`);
      expect(res.status).toBe(500);
      expect(caughtError).toBe('Hook failure test');
    } finally {
      await app.close();
    }
  });
});
