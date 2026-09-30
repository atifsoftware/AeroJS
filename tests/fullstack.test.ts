import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Aero,
  createTestClient,
  serveStatic,
  cors,
  SimpleViewDriver,
  ViewEngine,
  viewPlugin,
  createEdgeDriver,
  createEjsDriver,
  Inertia,
  inertiaPlugin,
  lazy,
} from '../src/index.js';

describe('Fullstack Capabilities: Static, CORS, Views & Inertia.js', () => {
  const testDir = join(process.cwd(), 'temp_test_static');

  beforeAll(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    writeFileSync(join(testDir, 'index.html'), '<h1>Aero SPA App</h1>');
    writeFileSync(join(testDir, 'styles.css'), 'body { background: #000; }');
    writeFileSync(join(testDir, 'logo.svg'), '<svg></svg>');
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Static Assets & SPA Fallback', () => {
    it('serves static files with correct MIME type and ETag', async () => {
      const app = new Aero();
      app.serveStatic('/assets', testDir);

      const client = createTestClient(app);

      const cssRes = await client.get('/assets/styles.css');
      expect(cssRes.status).toBe(200);
      expect(cssRes.headers['content-type']).toBe('text/css; charset=utf-8');
      expect(cssRes.headers['etag']).toBeDefined();
      expect(cssRes.text()).toContain('background: #000');

      // Test 304 Not Modified
      const etag = cssRes.headers['etag'] as string;
      const cachedRes = await client.get('/assets/styles.css', {
        headers: { 'if-none-match': etag },
      });
      expect(cachedRes.status).toBe(304);
    });

    it('falls back to index.html for client-side SPA routing', async () => {
      const app = new Aero();
      app.serveStatic({
        root: testDir,
        spa: true,
      });

      const client = createTestClient(app);

      // Request an unknown SPA route accepting HTML
      const spaRes = await client.get('/users/settings/profile', {
        headers: { accept: 'text/html' },
      });

      expect(spaRes.status).toBe(200);
      expect(spaRes.headers['content-type']).toContain('text/html');
      expect(spaRes.text()).toBe('<h1>Aero SPA App</h1>');
    });
  });

  describe('CORS Middleware', () => {
    it('handles CORS preflight OPTIONS requests', async () => {
      const app = new Aero();
      app.useCors({
        origin: 'https://my-frontend.com',
        methods: ['GET', 'POST', 'PUT'],
        credentials: true,
      });

      const client = createTestClient(app);
      const res = await client.options('/api/data', {
        headers: {
          origin: 'https://my-frontend.com',
          'access-control-request-headers': 'authorization, content-type',
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('https://my-frontend.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toBe('GET, POST, PUT');
      expect(res.headers['access-control-allow-headers']).toBe('authorization, content-type');
    });

    it('sets CORS headers on normal API requests', async () => {
      const app = new Aero();
      app.useCors({ origin: '*' });
      app.get('/api/ping', (ctx) => ctx.send('pong'));

      const client = createTestClient(app);
      const res = await client.get('/api/ping', {
        headers: { origin: 'http://localhost:5173' },
      });

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('handles origin array, function, maxAge, and exposedHeaders', async () => {
      const app = new Aero();
      app.useCors({
        origin: (reqOrigin) => reqOrigin === 'https://trusted.org' ? 'https://trusted.org' : false,
        exposedHeaders: ['X-Total-Count', 'X-Page'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        maxAge: 3600,
      });

      app.get('/data', (ctx) => ctx.json({ ok: true }));

      const client = createTestClient(app);

      // Trusted origin
      const trusted = await client.get('/data', {
        headers: { origin: 'https://trusted.org' },
      });
      expect(trusted.headers['access-control-allow-origin']).toBe('https://trusted.org');
      expect(trusted.headers['vary']).toBe('Origin');
      expect(trusted.headers['access-control-expose-headers']).toBe('X-Total-Count, X-Page');

      // Untrusted origin
      const untrusted = await client.get('/data', {
        headers: { origin: 'https://evil.org' },
      });
      expect(untrusted.headers['access-control-allow-origin']).toBeUndefined();

      // Preflight with maxAge and allowedHeaders
      const preflight = await client.options('/data', {
        headers: { origin: 'https://trusted.org' },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers['access-control-max-age']).toBe('3600');
      expect(preflight.headers['access-control-allow-headers']).toBe('Authorization, Content-Type');

      // Request without origin header
      const noOrigin = await client.get('/data');
      expect(noOrigin.status).toBe(200);
    });
  });

  describe('View Engine (Template Rendering)', () => {
    it('renders templates with SimpleViewDriver and ctx.view', async () => {
      const app = new Aero();
      const driver = new SimpleViewDriver({
        welcome: '<h1>Hello, {{ user.name }}!</h1><p>Framework: {{ framework }}</p>',
      });

      app.useViewEngine(driver);

      app.get('/welcome', async (ctx) => {
        await ctx.view('welcome', {
          user: { name: 'Ada' },
          framework: 'Aero',
        });
      });

      const client = createTestClient(app);
      const res = await client.get('/welcome');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text()).toBe('<h1>Hello, Ada!</h1><p>Framework: Aero</p>');
    });

    it('supports Edge.js and EJS adapters', async () => {
      // Mock Edge.js engine
      const mockEdge = {
        render: async (template: string, state?: any) => `[Edge:${template}:${state?.user}]`,
      };
      const edgeDriver = createEdgeDriver(mockEdge);
      expect(await edgeDriver.render('home', { user: 'Alan' })).toBe('[Edge:home:Alan]');

      // Mock EJS engine
      const mockEjs = {
        render: (template: string, data?: any) => `[EJS:${template}:${data?.item}]`,
      };
      const ejsDriver = createEjsDriver(mockEjs);
      expect(await ejsDriver.render('items', { item: 'Laptop' })).toBe('[EJS:items:Laptop]');
    });
  });

  describe('Inertia.js Protocol Adapter', () => {
    it('renders initial HTML shell for first-time browser visits', async () => {
      const app = new Aero();
      app.useInertia({ version: '1.0' });

      app.get('/users', async (ctx) => {
        await ctx.inertia.render('Users/Index', {
          users: [{ id: 1, name: 'Grace Hopper' }],
        });
      });

      const client = createTestClient(app);
      const res = await client.get('/users');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text()).toContain('<div id="app" data-page=');
      expect(res.text()).toContain('Users/Index');
      expect(res.text()).toContain('Grace Hopper');
    });

    it('returns JSON page object for subsequent Inertia AJAX visits', async () => {
      const app = new Aero();
      app.useInertia({ version: '1.0' });

      app.get('/users', async (ctx) => {
        await ctx.inertia.render('Users/Index', {
          users: [{ id: 1, name: 'Grace Hopper' }],
        });
      });

      const client = createTestClient(app);
      const res = await client.get('/users', {
        headers: { 'x-inertia': 'true' },
      });

      expect(res.status).toBe(200);
      expect(res.headers['x-inertia']).toBe('true');
      expect(res.headers['content-type']).toContain('application/json');

      const data = res.json() as any;
      expect(data.component).toBe('Users/Index');
      expect(data.props.users).toHaveLength(1);
      expect(data.version).toBe('1.0');
    });

    it('handles asset version mismatch with 409 Conflict', async () => {
      const app = new Aero();
      app.useInertia({ version: '2.0.0' });

      app.get('/dashboard', async (ctx) => {
        await ctx.inertia.render('Dashboard');
      });

      const client = createTestClient(app);
      const res = await client.get('/dashboard', {
        headers: {
          'x-inertia': 'true',
          'x-inertia-version': '1.0.0', // outdated client version
        },
      });

      expect(res.status).toBe(409);
      expect(res.headers['x-inertia-location']).toBe('/dashboard');
    });

    it('supports partial reloads and lazy evaluated props', async () => {
      let lazyEvaluated = false;

      const app = new Aero();
      app.useInertia();

      app.get('/users', async (ctx) => {
        await ctx.inertia.render('Users/Index', {
          title: 'Users List',
          heavyData: lazy(async () => {
            lazyEvaluated = true;
            return { records: [1, 2, 3] };
          }),
        });
      });

      const client = createTestClient(app);

      // Normal request: heavyData is NOT requested in partial reload
      await client.get('/users', {
        headers: {
          'x-inertia': 'true',
          'x-inertia-partial-component': 'Users/Index',
          'x-inertia-partial-data': 'title',
        },
      });

      expect(lazyEvaluated).toBe(false);

      // Partial request specifically requesting heavyData:
      const res2 = await client.get('/users', {
        headers: {
          'x-inertia': 'true',
          'x-inertia-partial-component': 'Users/Index',
          'x-inertia-partial-data': 'heavyData',
        },
      });

      expect(lazyEvaluated).toBe(true);
      const body2 = res2.json() as any;
      expect(body2.props.heavyData).toEqual({ records: [1, 2, 3] });
      expect(body2.props.title).toBeUndefined(); // title was omitted because it was not in partial-data
    });

    it('uses status 303 for Inertia redirects on PUT/PATCH/DELETE', () => {
      const mockCtx: any = {
        method: 'DELETE',
        redirect: (url: string, status: number) => {
          expect(url).toBe('/login');
          expect(status).toBe(303);
        },
      };

      const inertia = new Inertia(mockCtx);
      inertia.redirect('/login');
    });
  });
});
