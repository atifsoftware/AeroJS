import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import {
  Aero,
  AeroRequest,
  AeroResponse,
  validateSchema,
  assertValid,
  compileFastSerializer,
  createTestClient,
  createControllerHandler,
  NamedMiddlewareRegistry,
} from '../src/index.js';

describe('Comprehensive Framework Coverage', () => {
  describe('Schema Validation & Fast Serializer Edge Cases', () => {
    it('validates integer types', () => {
      const schema = { type: 'integer' };
      expect(validateSchema(schema, 42)).toHaveLength(0);
      expect(validateSchema(schema, 42.5)).toHaveLength(1);
      expect(validateSchema(schema, '42')).toHaveLength(1);
    });

    it('validates enum values', () => {
      const schema = { enum: ['admin', 'editor', 'viewer'] };
      expect(validateSchema(schema, 'admin')).toHaveLength(0);
      expect(validateSchema(schema, 'guest')).toHaveLength(1);
    });

    it('validates minLength, maxLength, and regex pattern', () => {
      const schema = {
        type: 'string',
        minLength: 3,
        maxLength: 8,
        pattern: '^[a-z]+$',
      };
      expect(validateSchema(schema, 'valid')).toHaveLength(0);
      expect(validateSchema(schema, 'ab')).toHaveLength(1); // too short
      expect(validateSchema(schema, 'toolongstring')).toHaveLength(1); // too long
      expect(validateSchema(schema, '12345')).toHaveLength(1); // bad pattern
    });

    it('validates email and uuid formats', () => {
      const emailSchema = { type: 'string', format: 'email' };
      expect(validateSchema(emailSchema, 'dev@aero.org')).toHaveLength(0);
      expect(validateSchema(emailSchema, 'not-an-email')).toHaveLength(1);

      const uuidSchema = { type: 'string', format: 'uuid' };
      expect(validateSchema(uuidSchema, '123e4567-e89b-12d3-a456-426614174000')).toHaveLength(0);
      expect(validateSchema(uuidSchema, 'invalid-uuid')).toHaveLength(1);
    });

    it('validates number minimum and maximum', () => {
      const schema = { type: 'number', minimum: 10, maximum: 50 };
      expect(validateSchema(schema, 25)).toHaveLength(0);
      expect(validateSchema(schema, 5)).toHaveLength(1);
      expect(validateSchema(schema, 100)).toHaveLength(1);
    });

    it('validates array items', () => {
      const schema = {
        type: 'array',
        items: { type: 'number' },
      };
      expect(validateSchema(schema, [1, 2, 3])).toHaveLength(0);
      const errors = validateSchema(schema, [1, 'two', 3]);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.dataPath).toBe('root[1]');
    });

    it('compileFastSerializer serializes objects and falls back correctly', () => {
      const fastSerializer = compileFastSerializer({
        type: 'object',
        properties: { id: { type: 'number' }, name: { type: 'string' } },
      });

      const res = fastSerializer({ id: 10, name: 'Aero', extra: 'ignored' });
      expect(res).toBe('{"id":10,"name":"Aero"}');

      // Non-object fallback
      expect(fastSerializer('string')).toBe('"string"');

      // Empty schema serializer
      const defaultSerializer = compileFastSerializer(undefined);
      expect(defaultSerializer({ a: 1 })).toBe('{"a":1}');
    });
  });

  describe('AeroRequest Advanced Properties', () => {
    it('resolves ip and protocol with and without proxy headers', () => {
      const mockReqWithProxy: any = {
        method: 'GET',
        url: '/',
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18',
          'x-forwarded-proto': 'https, http',
          host: 'aero.local:8080',
        },
        socket: { remoteAddress: '10.0.0.1', encrypted: false },
      };

      const reqWithProxy = new AeroRequest(mockReqWithProxy, { trustProxy: true });
      expect(reqWithProxy.ip).toBe('203.0.113.195');
      expect(reqWithProxy.protocol).toBe('https');
      expect(reqWithProxy.hostname).toBe('aero.local');

      const mockDirectReq: any = {
        method: 'GET',
        url: '/',
        headers: {},
        socket: { remoteAddress: '127.0.0.1', encrypted: true },
      };
      const reqDirect = new AeroRequest(mockDirectReq, { trustProxy: false });
      expect(reqDirect.ip).toBe('127.0.0.1');
      expect(reqDirect.protocol).toBe('https');
    });

    it('sets and gets custom request properties', () => {
      const mockReq: any = {
        method: 'GET',
        url: '/',
        headers: {},
        socket: {},
      };
      const req = new AeroRequest(mockReq);
      req.setCustom('userContext', { id: 7 });
      expect(req.getCustom('userContext')).toEqual({ id: 7 });
      expect(req.getCustom('missing')).toBeUndefined();
    });
  });

  describe('AeroResponse Edge Cases', () => {
    it('supports streams, primitive numbers, booleans, and bigints in ctx.send', async () => {
      const app = new Aero();

      app.get('/stream', (ctx) => {
        const stream = Readable.from(['chunk1, ', 'chunk2']);
        ctx.send(stream);
      });

      app.get('/number', (ctx) => ctx.send(12345));
      app.get('/boolean', (ctx) => ctx.send(true));
      app.get('/bigint', (ctx) => ctx.send(BigInt(999999999999)));

      const client = createTestClient(app);

      const streamRes = await client.get('/stream');
      expect(streamRes.text()).toBe('chunk1, chunk2');

      const numRes = await client.get('/number');
      expect(numRes.text()).toBe('12345');

      const boolRes = await client.get('/boolean');
      expect(boolRes.text()).toBe('true');

      const bigRes = await client.get('/bigint');
      expect(bigRes.text()).toBe('999999999999');
    });

    it('supports response header helpers: removeHeader, type aliases, clearCookie', async () => {
      const app = new Aero();
      app.get('/cookies', (ctx) => {
        ctx.res.set({ 'X-Custom-1': 'val1', 'X-Remove-Me': 'remove' });
        ctx.res.removeHeader('X-Remove-Me');
        ctx.res.type('html');
        ctx.res.clearCookie('session');
        ctx.res.setCustom('meta', 'data');
        expect(ctx.res.getCustom('meta')).toBe('data');
        ctx.send('<h1>Cookies Cleared</h1>');
      });

      const client = createTestClient(app);
      const res = await client.get('/cookies');

      expect(res.headers['x-custom-1']).toBe('val1');
      expect(res.headers['x-remove-me']).toBeUndefined();
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('RouteBuilder, RouteGroup and NamedMiddleware Edge Cases', () => {
    it('supports chaining HTTP methods on RouteBuilder', () => {
      const app = new Aero();
      const builder = app.get('/first', (ctx) => ctx.send('1'));
      builder
        .post('/second', (ctx) => ctx.send('2'))
        .put('/third', (ctx) => ctx.send('3'))
        .patch('/fourth', (ctx) => ctx.send('4'))
        .delete('/fifth', (ctx) => ctx.send('5'))
        .head('/sixth', (ctx) => ctx.send('6'))
        .options('/seventh', (ctx) => ctx.send('7'))
        .all('/eighth', (ctx) => ctx.send('8'));

      expect(app.router.hasPath('/first')).toBe(true);
      expect(app.router.hasPath('/second')).toBe(true);
      expect(app.router.hasPath('/third')).toBe(true);
      expect(app.router.hasPath('/fourth')).toBe(true);
      expect(app.router.hasPath('/fifth')).toBe(true);
      expect(app.router.hasPath('/sixth')).toBe(true);
      expect(app.router.hasPath('/seventh')).toBe(true);
      expect(app.router.hasPath('/eighth')).toBe(true);
    });

    it('supports all HTTP methods on RouteGroup', () => {
      const app = new Aero();
      app.group('/group', (g) => {
        g.put('/item', (ctx) => ctx.send('put'));
        g.patch('/item', (ctx) => ctx.send('patch'));
        g.delete('/item', (ctx) => ctx.send('delete'));
        g.head('/item', (ctx) => ctx.send('head'));
        g.options('/item', (ctx) => ctx.send('options'));
        g.all('/item-all', (ctx) => ctx.send('all'));
      });

      expect(app.router.hasPath('/group/item')).toBe(true);
      expect(app.router.hasPath('/group/item-all')).toBe(true);
    });

    it('rejects invalid middleware in NamedMiddlewareRegistry', () => {
      const registry = new NamedMiddlewareRegistry();
      expect(() => {
        registry.register('invalid', 'not-a-function' as any);
      }).toThrow(TypeError);
    });

    it('rejects invalid controller definitions', () => {
      expect(() => {
        createControllerHandler('not-a-controller' as any);
      }).toThrow(TypeError);
    });
  });
});
