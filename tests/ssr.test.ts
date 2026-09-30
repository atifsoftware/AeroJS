import { describe, it, expect } from 'vitest';
import { Aero, SSREngine } from '../src/index.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('AeroJS Server-Side Rendering (SSR) & Next.js-style Architecture (Step 3)', () => {
  describe('SSREngine', () => {
    it('renders registered components to HTML string with hydration data-page attribute', async () => {
      const engine = new SSREngine();

      engine.register('Home', (props: { title: string; count: number }) => {
        return `<main class="hero"><h1>${props.title}</h1><p>Count: ${props.count}</p></main>`;
      });

      const page = {
        component: 'Home',
        props: { title: 'Welcome to Aero SSR', count: 42 },
        url: '/',
        version: '1.0',
      };

      const result = await engine.render(page);

      expect(result.body).toContain('<main class="hero"><h1>Welcome to Aero SSR</h1><p>Count: 42</p></main>');
      expect(result.html).toContain('data-page=');
      expect(result.html).toContain('Welcome to Aero SSR');
    });

    it('extracts SEO head tags (title, meta, OpenGraph) and injects into template head', async () => {
      const engine = new SSREngine();

      engine.register('PostDetail', (props: { post: { title: string; desc: string } }) => {
        return {
          head: [
            `<title>${props.post.title} | Aero Blog</title>`,
            `<meta name="description" content="${props.post.desc}" />`,
            `<meta property="og:title" content="${props.post.title}" />`,
          ],
          body: `<article><h2>${props.post.title}</h2><p>${props.post.desc}</p></article>`,
        };
      });

      const page = {
        component: 'PostDetail',
        props: { post: { title: 'Mastering SSR in AeroJS', desc: 'Zero runtime overhead SSR' } },
        url: '/posts/mastering-ssr',
        version: '1.0',
      };

      const result = await engine.render(page);

      expect(result.head).toHaveLength(3);
      expect(result.html).toContain('<title>Mastering SSR in AeroJS | Aero Blog</title>');
      expect(result.html).toContain('<meta property="og:title" content="Mastering SSR in AeroJS" />');
      expect(result.html).toContain('<article><h2>Mastering SSR in AeroJS</h2>');
    });

    it('gracefully falls back to empty body shell when component throws in SSR', async () => {
      const engine = new SSREngine({ gracefulFallback: true });

      engine.register('BrokenComponent', () => {
        throw new Error('window is not defined (client-only code called in SSR)');
      });

      const page = {
        component: 'BrokenComponent',
        props: {},
        url: '/broken',
        version: '1.0',
      };

      const result = await engine.render(page);
      expect(result.body).toBe('');
      // Client shell still rendered so browser can hydrate
      expect(result.html).toContain('<div id="app" data-page=');
    });
  });

  describe('Fullstack Aero App with Inertia SSR', () => {
    it('serves server-rendered HTML on initial visit and JSON on Inertia navigation', async () => {
      const app = new Aero();

      // Configure Inertia with SSR enabled
      app.useInertia({
        ssr: {
          components: {
            Dashboard: (props: { user: string; role: string }) => {
              return {
                head: [`<title>Dashboard - ${props.user}</title>`],
                body: `<div class="dashboard"><h1>Welcome, ${props.user}!</h1><span class="badge">${props.role}</span></div>`,
              };
            },
          },
        },
      });

      app.get('/dashboard', async (ctx) => {
        await ctx.inertia.render('Dashboard', {
          user: 'Atif',
          role: 'Architect',
        });
      });

      const client = createTestClient(app);

      // 1. Initial browser visit (regular GET, no X-Inertia header) -> Returns Full Server-Side Rendered HTML
      const initialRes = await client.get('/dashboard');
      expect(initialRes.status).toBe(200);
      expect(initialRes.headers['content-type']).toContain('text/html');

      const html = initialRes.text();
      expect(html).toContain('<title>Dashboard - Atif</title>');
      expect(html).toContain('Welcome, Atif!');
      expect(html).toContain('<span class="badge">Architect</span>');
      expect(html).toContain('data-page=');

      // 2. Client-side navigation (with X-Inertia: true header) -> Returns fast JSON without re-rendering HTML
      const inertiaRes = await client.get('/dashboard', {
        headers: { 'X-Inertia': 'true' },
      });
      expect(inertiaRes.status).toBe(200);
      expect(inertiaRes.headers['x-inertia']).toBe('true');
      const json = inertiaRes.json();
      expect(json.component).toBe('Dashboard');
      expect(json.props.user).toBe('Atif');
      expect(json.props.role).toBe('Architect');
    });
  });
});
