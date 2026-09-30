import { describe, it, expect } from 'vitest';
import { AeroContext } from '../src/core/context.js';
import { AeroRequest } from '../src/core/request.js';
import { AeroResponse } from '../src/core/response.js';
import { EventEmitter } from 'node:events';

function createMockContext(url = '/test?sort=asc&filter=active') {
  const reqEmitter = new EventEmitter();
  const resEmitter = new EventEmitter();

  const headers: Record<string, string> = {
    host: 'localhost:3000',
    cookie: 'session_id=s-12345; theme=dark',
  };

  const rawReq = Object.assign(reqEmitter, {
    method: 'GET',
    url,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  });

  const rawRes = Object.assign(resEmitter, {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    _headers: {} as Record<string, any>,
    setHeader(key: string, val: any) {
      this._headers[key.toLowerCase()] = val;
    },
    getHeader(key: string) {
      return this._headers[key.toLowerCase()];
    },
    removeHeader(key: string) {
      delete this._headers[key.toLowerCase()];
    },
    end() {
      this.writableEnded = true;
    },
  });

  return new AeroContext(new AeroRequest(rawReq as any), new AeroResponse(rawRes as any));
}

describe('AeroContext', () => {
  it('exposes request properties, queries, params, and state', () => {
    const ctx = createMockContext('/articles?page=2');
    ctx.params = { id: '42' };
    ctx.state.user = { name: 'Alice' };

    expect(ctx.method).toBe('GET');
    expect(ctx.path).toBe('/articles');
    expect(ctx.query).toEqual({ page: '2' });
    expect(ctx.params).toEqual({ id: '42' });
    expect(ctx.state.user).toEqual({ name: 'Alice' });
  });

  it('parses request cookies lazily', () => {
    const ctx = createMockContext();
    expect(ctx.cookies['session_id']).toBe('s-12345');
    expect(ctx.cookies['theme']).toBe('dark');
  });

  it('sets and clears response cookies', () => {
    const ctx = createMockContext();
    ctx.cookie('token', 'xyz', { httpOnly: true });

    const rawRes = ctx.rawRes as any;
    expect(rawRes._headers['set-cookie']).toBeDefined();
    expect(rawRes._headers['set-cookie'][0]).toContain('token=xyz');
    expect(rawRes._headers['set-cookie'][0]).toContain('HttpOnly');

    ctx.clearCookie('token');
    expect(rawRes._headers['set-cookie'][1]).toContain('Max-Age=0');
  });

  it('provides throw helper that maps to AeroError subclasses', () => {
    const ctx = createMockContext();

    expect(() => ctx.throw(400, 'Bad Input')).toThrow('Bad Input');
    expect(() => ctx.throw(401)).toThrow('Unauthorized');
    expect(() => ctx.throw(403)).toThrow('Forbidden');
    expect(() => ctx.throw(404)).toThrow('Not Found');
    expect(() => ctx.throw(405)).toThrow('Method Not Allowed');
    expect(() => ctx.throw(500, 'Boom')).toThrow('Boom');
  });
});
