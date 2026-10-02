import { describe, it, expect } from 'vitest';
import {
  Aero,
  createTestClient,
  sessionPlugin,
  CookieSessionDriver,
  RequestFingerprint,
  fingerprintGuard,
} from '../src/index.js';

describe('Encrypted CookieSessionDriver & Request Fingerprinting', () => {
  it('encrypts session state into an HTTP cookie and restores it on next request', async () => {
    const app = new Aero();
    const cookieDriver = new CookieSessionDriver();

    app.use(sessionPlugin({
      driver: cookieDriver,
      cookieName: 'my_cookie_session',
    }));

    app.post('/login', async (ctx) => {
      await ctx.session.put('userId', 101);
      await ctx.session.put('role', 'doctor');
      ctx.json({ success: true });
    });

    app.get('/profile', async (ctx) => {
      const userId = await ctx.session.get('userId');
      const role = await ctx.session.get('role');
      ctx.json({ userId, role });
    });

    const client = createTestClient(app);

    // 1. Login
    const loginRes = await client.post('/login');
    expect(loginRes.status).toBe(200);

    // Extract Set-Cookie header
    const rawSetCookie = loginRes.headers['set-cookie'];
    const setCookie = Array.isArray(rawSetCookie) ? rawSetCookie.join('; ') : String(rawSetCookie || '');
    expect(setCookie).toContain('my_cookie_session=aero%3Aenc%3A'); // URL-encoded aero:enc:

    // Match cookie value
    const match = /my_cookie_session=([^;]+)/.exec(setCookie);
    expect(match).not.toBeNull();
    const cookieVal = decodeURIComponent(match![1]!);

    expect(cookieVal.startsWith('aero:enc:')).toBe(true);
    expect(cookieVal).not.toContain('doctor'); // Ensure plaintext not leaked

    // 2. Access profile using the encrypted session cookie
    const profileRes = await client.get('/profile', {
      headers: {
        cookie: `my_cookie_session=${encodeURIComponent(cookieVal)}`,
      },
    });

    expect(profileRes.status).toBe(200);
    expect(profileRes.json().userId).toBe(101);
    expect(profileRes.json().role).toBe('doctor');
  });

  it('safely rejects tampered cookies without crashing', async () => {
    const app = new Aero();
    app.use(sessionPlugin({
      driver: new CookieSessionDriver(),
      cookieName: 'my_cookie_session',
    }));

    app.get('/profile', async (ctx) => {
      const userId = await ctx.session.get('userId');
      ctx.json({ userId: userId ?? null });
    });

    const client = createTestClient(app);

    // Provide a malformed or corrupted ciphertext
    const tamperedCookie = 'aero:enc:112233445566:aabbccdd:99887766';
    const res = await client.get('/profile', {
      headers: {
        cookie: `my_cookie_session=${encodeURIComponent(tamperedCookie)}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.json().userId).toBeNull();
  });

  describe('RequestFingerprint & Anti-Hijacking Guard', () => {
    it('produces deterministic SHA-256 hashes from request traits', async () => {
      const app = new Aero();
      let fp1 = '';
      let fp2 = '';
      let fp3 = '';

      app.get('/check-fp', async (ctx) => {
        const fp = RequestFingerprint.generate(ctx);
        ctx.json({ fp });
      });

      const client = createTestClient(app);

      // Same headers
      const res1 = await client.get('/check-fp', {
        headers: { 'user-agent': 'Chrome/120', 'accept-language': 'en-US' },
      });
      fp1 = res1.json().fp;

      const res2 = await client.get('/check-fp', {
        headers: { 'user-agent': 'Chrome/120', 'accept-language': 'en-US' },
      });
      fp2 = res2.json().fp;
      expect(fp1).toBe(fp2);

      // Different user agent
      const res3 = await client.get('/check-fp', {
        headers: { 'user-agent': 'Firefox/122', 'accept-language': 'en-US' },
      });
      fp3 = res3.json().fp;
      expect(fp1).not.toBe(fp3);
    });

    it('blocks hijacked sessions when client fingerprint changes', async () => {
      const app = new Aero();
      app.use(sessionPlugin());
      app.use(fingerprintGuard());

      app.post('/auth/login', async (ctx) => {
        await ctx.session.put('authenticated', true);
        ctx.json({ ok: true });
      });

      app.get('/auth/dashboard', async (ctx) => {
        const isAuth = await ctx.session.get('authenticated');
        ctx.json({ authenticated: isAuth });
      });

      const client = createTestClient(app);

      // 1. Legitimate user logs in with Chrome
      const loginRes = await client.post('/auth/login', {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' },
      });
      const setCookie = loginRes.headers['set-cookie'] || '';
      const cookieMatch = /aero_session=([^;]+)/.exec(setCookie);
      const sessionCookie = `aero_session=${cookieMatch![1]}`;

      // 2. Legitimate user accesses dashboard with same User-Agent -> 200
      const okRes = await client.get('/auth/dashboard', {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
          cookie: sessionCookie,
        },
      });
      expect(okRes.status).toBe(200);
      expect(okRes.json().authenticated).toBe(true);

      // 3. Attacker steals cookie and uses it from a different device (different User-Agent) -> 401
      const hijackRes = await client.get('/auth/dashboard', {
        headers: {
          'user-agent': 'Python-requests/2.31', // Attacker script
          cookie: sessionCookie,
        },
      });
      expect(hijackRes.status).toBe(401);
      expect(hijackRes.json().error).toContain('Session fingerprint mismatch');
    });
  });
});
