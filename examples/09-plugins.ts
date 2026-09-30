/**
 * @file 09-plugins.ts
 * @description Fastify-style modular plugins and encapsulation in Aero.
 */

import { Aero, createPlugin } from '../src/index.js';

const app = new Aero();

// 1. Shared plugin that breaks out of encapsulation (extends root app)
const sharedDatabasePlugin = createPlugin(async (root) => {
  root.decorate('db', {
    users: [{ id: 1, name: 'Grace Hopper' }],
  });
});

// 2. Encapsulated feature plugin
const authPlugin = async (child: Aero) => {
  child.decorate('tokenSecret', 'aero_secret_token_2026');

  child.use(async (ctx, next) => {
    ctx.set('X-Auth-Plugin', 'active');
    await next();
  });

  child.get('/login', (ctx) => {
    ctx.json({
      message: 'Logged in successfully',
      secret: (child as any).tokenSecret,
    });
  });
};

// Register shared plugin globally
await app.register(sharedDatabasePlugin);

// Register feature plugin with '/auth' prefix
await app.register(authPlugin, { prefix: '/auth' });

// Root application route
app.get('/users', (ctx) => {
  // Can access globally decorated 'db', but not child 'tokenSecret'
  const db = (app as any).db;
  ctx.json({ users: db.users, hasSecret: Boolean((app as any).tokenSecret) });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
