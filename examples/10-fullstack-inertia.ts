/**
 * @file 10-fullstack-inertia.ts
 * @description Full-stack application example using Aero with Inertia.js (React/Vue 3) and Views.
 */

import { Aero, SimpleViewDriver } from '../src/index.js';

const app = new Aero();

// 1. Enable CORS for mobile or decoupled apps
app.useCors({
  origin: '*',
  credentials: true,
});

// 2. Setup SSR Template Engine (Edge.js / EJS / SimpleViewDriver)
const viewDriver = new SimpleViewDriver({
  'marketing.home': `
    <!DOCTYPE html>
    <html>
      <head><title>{{ title }}</title></head>
      <body>
        <h1>Welcome to {{ framework }}</h1>
        <p>A complete full-stack Node.js framework supporting React, Vue 3, Inertia, and SSR.</p>
        <a href="/app/dashboard">Go to Inertia App &rarr;</a>
      </body>
    </html>
  `,
});
app.useViewEngine(viewDriver);

// 3. Setup Inertia.js for React and Vue 3 SPAs
app.useInertia({
  version: '1.0.0',
  rootView: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Aero + Inertia</title>
      </head>
      <body>
        @inertia
      </body>
    </html>
  `,
});

// Server-side rendered marketing page (Edge.js / EJS style)
app.get('/', async (ctx) => {
  await ctx.view('marketing.home', {
    title: 'Aero - Modern Web Framework',
    framework: 'Aero',
  });
});

// Inertia.js Page Route (serves React or Vue 3 SPA components seamlessly)
app.get('/app/dashboard', async (ctx) => {
  await ctx.inertia.render('Dashboard', {
    user: { name: 'Fullstack Architect', role: 'admin' },
    stats: { users: 1250, revenue: '$48,200' },
  });
});

// Standard JSON REST API endpoint
app.get('/api/health', (ctx) => {
  ctx.json({ status: 'ok', fullstack: true });
});

await app.listen(3000);
console.log('🚀 Fullstack Aero server listening at http://localhost:3000');
