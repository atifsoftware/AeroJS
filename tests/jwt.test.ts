import { describe, it, expect } from 'vitest';
import {
  jwt,
  sign,
  verify,
  decode,
  jwtAuth,
  parseTimespan,
  JsonWebTokenError,
  TokenExpiredError,
  NotBeforeError,
} from '../src/security/jwt.js';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Zero-Dependency JWT Security Module', () => {
  const secret = 'super-secret-key-for-testing-1234567890';

  describe('parseTimespan', () => {
    it('parses numeric seconds directly', () => {
      expect(parseTimespan(60)).toBe(60);
      expect(parseTimespan(3600.8)).toBe(3600);
    });

    it('parses string representations correctly', () => {
      expect(parseTimespan('30s')).toBe(30);
      expect(parseTimespan('15m')).toBe(900);
      expect(parseTimespan('2h')).toBe(7200);
      expect(parseTimespan('1d')).toBe(86400);
      expect(parseTimespan('1w')).toBe(604800);
      expect(parseTimespan('1y')).toBe(31536000);
    });

    it('throws JsonWebTokenError on invalid format', () => {
      expect(() => parseTimespan('invalid-time')).toThrow(JsonWebTokenError);
      expect(() => parseTimespan(NaN)).toThrow(JsonWebTokenError);
    });
  });

  describe('sign and verify', () => {
    it('signs and verifies payload with HS256 by default', () => {
      const payload = { userId: 42, role: 'admin' };
      const token = sign(payload, secret);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const decoded = verify<typeof payload>(token, secret);
      expect(decoded.userId).toBe(42);
      expect(decoded.role).toBe('admin');
      expect(decoded.iat).toBeDefined();
    });

    it('supports HS384 and HS512 algorithms', () => {
      const payload = { user: 'atif' };

      const token384 = sign(payload, secret, { algorithm: 'HS384' });
      const decoded384 = verify<typeof payload>(token384, secret, { algorithms: ['HS384'] });
      expect(decoded384.user).toBe('atif');

      const token512 = sign(payload, secret, { algorithm: 'HS512' });
      const decoded512 = verify<typeof payload>(token512, secret, { algorithms: ['HS512'] });
      expect(decoded512.user).toBe('atif');
    });

    it('detects tampering and rejects invalid signatures', () => {
      const token = sign({ user: 'hacker' }, secret);
      const parts = token.split('.');
      // Tamper with payload
      const tamperedPayload = Buffer.from(JSON.stringify({ user: 'admin', role: 'root' })).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      expect(() => verify(tamperedToken, secret)).toThrow(JsonWebTokenError);
      expect(() => verify(tamperedToken, secret)).toThrow(/invalid signature/);
    });

    it('rejects verification with wrong secret key', () => {
      const token = sign({ user: 'bob' }, secret);
      expect(() => verify(token, 'wrong-secret-key')).toThrow(/invalid signature/);
    });

    it('handles expiration claim (exp)', async () => {
      const token = sign({ id: 1 }, secret, { expiresIn: '1s' });
      // Immediately valid
      expect(verify(token, secret).id).toBe(1);

      // Wait 1.1s for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(() => verify(token, secret)).toThrow(TokenExpiredError);
      expect(() => verify(token, secret)).toThrow(/jwt expired/);

      // Can be ignored if ignoreExpiration is true
      const ignored = verify(token, secret, { ignoreExpiration: true });
      expect(ignored.id).toBe(1);
    });

    it('handles notBefore claim (nbf)', () => {
      const token = sign({ id: 2 }, secret, { notBefore: '10s' });
      expect(() => verify(token, secret)).toThrow(NotBeforeError);
      expect(() => verify(token, secret)).toThrow(/jwt not active/);

      // Can be ignored if ignoreNotBefore is true
      const ignored = verify(token, secret, { ignoreNotBefore: true });
      expect(ignored.id).toBe(2);
    });

    it('validates issuer (iss), subject (sub), and audience (aud)', () => {
      const token = sign({ foo: 'bar' }, secret, {
        issuer: 'aerojs.org',
        subject: 'sub123',
        audience: ['web-app', 'mobile-app'],
      });

      // Valid claims
      const decoded = verify(token, secret, {
        issuer: 'aerojs.org',
        subject: 'sub123',
        audience: 'web-app',
      });
      expect(decoded.foo).toBe('bar');

      // Invalid issuer
      expect(() => verify(token, secret, { issuer: 'other.org' })).toThrow(/jwt issuer invalid/);

      // Invalid subject
      expect(() => verify(token, secret, { subject: 'wrong-sub' })).toThrow(/jwt subject invalid/);

      // Invalid audience
      expect(() => verify(token, secret, { audience: 'desktop-app' })).toThrow(/jwt audience invalid/);
    });
  });

  describe('decode', () => {
    it('decodes header and payload without verifying signature', () => {
      const token = sign({ info: 'secret-info' }, secret, { jwtid: 'uuid-123' });
      const decoded = decode(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.header.alg).toBe('HS256');
      expect(decoded?.payload.info).toBe('secret-info');
      expect(decoded?.payload.jti).toBe('uuid-123');
    });

    it('returns null for malformed token string', () => {
      expect(decode('not-a-token')).toBeNull();
      expect(decode(123 as any)).toBeNull();
    });
  });

  describe('jwtAuth middleware', () => {
    it('authenticates request via Authorization: Bearer <token>', async () => {
      const app = new Aero();
      app.use(jwtAuth({ secret }));

      app.get('/protected', (ctx) => {
        ctx.send({ user: ctx.state.user });
      });

      const client = createTestClient(app);
      const token = sign({ userId: 100, username: 'atif' }, secret);

      const res = await client.get('/protected', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(200);
      const data = res.json<any>();
      expect(data.user.userId).toBe(100);
      expect(data.user.username).toBe('atif');
    });

    it('authenticates request via cookie', async () => {
      const app = new Aero();
      app.use(jwtAuth({ secret, cookie: 'auth_token' }));

      app.get('/me', (ctx) => {
        ctx.send({ profile: ctx.state.user });
      });

      const client = createTestClient(app);
      const token = sign({ userId: 200 }, secret);

      const res = await client.get('/me', {
        headers: {
          cookie: `auth_token=${token}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.json<any>().profile.userId).toBe(200);
    });

    it('supports custom getToken extractor', async () => {
      const app = new Aero();
      app.use(
        jwtAuth({
          secret,
          getToken: (ctx) => ctx.query['access_token'] as string,
        })
      );

      app.get('/download', (ctx) => ctx.send('granted'));

      const client = createTestClient(app);
      const token = sign({ fileAccess: true }, secret);

      const res = await client.get(`/download?access_token=${token}`);
      expect(res.status).toBe(200);
      expect(res.text()).toBe('granted');
    });

    it('returns 401 when token is missing and credentialsRequired=true', async () => {
      const app = new Aero();
      app.use(jwtAuth({ secret, credentialsRequired: true }));
      app.get('/secure', (ctx) => ctx.send('ok'));

      const client = createTestClient(app);
      const res = await client.get('/secure');

      expect(res.status).toBe(401);
      expect(res.json<any>().error.message).toContain('No authorization token was found');
    });

    it('allows access when credentialsRequired=false and token is missing', async () => {
      const app = new Aero();
      app.use(jwtAuth({ secret, credentialsRequired: false }));
      app.get('/optional', (ctx) => {
        ctx.send({ user: ctx.state.user || null });
      });

      const client = createTestClient(app);
      const res = await client.get('/optional');

      expect(res.status).toBe(200);
      expect(res.json<any>().user).toBeNull();
    });

    it('returns 401 when token is invalid or expired', async () => {
      const app = new Aero();
      app.use(jwtAuth({ secret }));
      app.get('/api/data', (ctx) => ctx.send('data'));

      const client = createTestClient(app);
      const res = await client.get('/api/data', {
        headers: { authorization: 'Bearer invalid.token.payload' },
      });

      expect(res.status).toBe(401);
    });

    it('supports dynamic secret provider function', async () => {
      const app = new Aero();
      app.use(
        jwtAuth({
          secret: async (_header, payload) => {
            if (payload.tenant === 'acme') return 'acme-secret';
            return 'default-secret';
          },
        })
      );

      app.get('/tenant-data', (ctx) => ctx.send(ctx.state.user));

      const client = createTestClient(app);
      const token = sign({ tenant: 'acme', user: 'alice' }, 'acme-secret');

      const res = await client.get('/tenant-data', {
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      expect(res.json<any>().tenant).toBe('acme');
    });
  });
});
