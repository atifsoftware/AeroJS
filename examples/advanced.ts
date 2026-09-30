/**
 * @file advanced.ts
 * @description Advanced features demo showcasing lifecycle hooks, JSON Schema validation,
 * plugins, sub-routers, decorators, and wildcards.
 */

import { Aero, type AeroPlugin } from '../src/index.js';

const app = new Aero({
  debug: true,
  trustProxy: true,
  bodyLimit: 512 * 1024, // 512 KB
});

// 1. Decorators
app.decorate('appStartTime', Date.now());
app.decorateRequest('startTime', Date.now());
app.decorateReply('poweredBy', 'Aero Web Framework');

// 2. Lifecycle Hooks
app.addHook('onRequest', async (ctx) => {
  ctx.set('X-Powered-By', 'Aero');
});

app.addHook('preHandler', async (ctx) => {
  console.log(`[Hook: preHandler] Routing to ${ctx.method} ${ctx.path}`);
});

app.addHook('onSend', async (_ctx, payload) => {
  // Can inspect or mutate payload before final dispatch
  return payload;
});

app.addHook('onError', async (error, ctx) => {
  console.error(`[Hook: onError] Request ${ctx.path} caught error:`, error.message);
});

// 3. Route with JSON Schema Validation
app.routeWithSchema(
  'POST',
  '/api/users',
  {
    body: {
      type: 'object',
      required: ['username', 'email', 'age'],
      properties: {
        username: { type: 'string', minLength: 3 },
        email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        age: { type: 'number', minimum: 18 },
      },
    },
    response: {
      201: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          createdAt: { type: 'string' },
        },
      },
    },
  },
  async (ctx) => {
    const body = ctx.body as { username: string; email: string; age: number };
    ctx.status(201).json({
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      username: body.username,
      createdAt: new Date().toISOString(),
    });
  }
);

// 4. Sub-routers via app.route() chaining
app.route('/items')
  .get((ctx) => {
    ctx.json({ items: ['book', 'laptop', 'coffee'] });
  })
  .post((ctx) => {
    ctx.status(201).json({ created: ctx.body });
  });

// 5. Encapsulated Plugin Registration
const metricsPlugin: AeroPlugin = (subApp) => {
  subApp.get('/health', (ctx) => {
    ctx.json({
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  subApp.get('/ping', (ctx) => {
    ctx.text('pong');
  });
};

await app.register(metricsPlugin, { prefix: '/system' });

// 6. Wildcard Route Matching
app.get('/static/*', (ctx) => {
  const filePath = ctx.params['*'] ?? '';
  ctx.json({
    asset: filePath,
    message: `Resolved asset: ${filePath}`,
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`⚡ Aero advanced demo listening on http://localhost:${PORT}`);
  console.log(`Routes available:`);
  console.log(`  POST http://localhost:${PORT}/api/users (with validation)`);
  console.log(`  GET  http://localhost:${PORT}/items`);
  console.log(`  POST http://localhost:${PORT}/items`);
  console.log(`  GET  http://localhost:${PORT}/system/health (plugin)`);
  console.log(`  GET  http://localhost:${PORT}/static/images/logo.png (wildcard)`);
});
