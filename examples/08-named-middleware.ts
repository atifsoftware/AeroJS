/**
 * @file 08-named-middleware.ts
 * @description Named middleware and Route Groups in Aero.
 */

import { Aero } from '../src/index.js';

const app = new Aero();

// Register reusable named middlewares
app.middleware('auth', async (ctx, next) => {
  const token = ctx.headers['authorization'];
  if (token !== 'Bearer secret-key') {
    return ctx.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  ctx.state.user = { id: 101, username: 'admin_user', isAdmin: true };
  await next();
});

app.middleware('adminOnly', async (ctx, next) => {
  if (!ctx.state.user?.isAdmin) {
    return ctx.status(403).json({ error: 'Forbidden: admin privilege required' });
  }
  await next();
});

// Public routes
app.get('/', (ctx) => {
  ctx.json({ message: 'Welcome to Aero Public API' });
});

// Grouped API routes with shared prefix and middleware
app.group('/api/v1', (api) => {
  api.use(async (ctx, next) => {
    ctx.set('X-Api-Version', 'v1');
    await next();
  });

  api.get('/profile', (ctx) => {
    ctx.json({ user: ctx.state.user });
  }).middleware('auth');

  // Nested admin group
  api.group('/admin', (admin) => {
    admin.use('auth', 'adminOnly');

    admin.get('/metrics', (ctx) => {
      ctx.json({ memoryUsage: process.memoryUsage(), uptime: process.uptime() });
    });
  });
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
