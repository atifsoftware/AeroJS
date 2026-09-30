/**
 * @file 02-middleware.ts
 * @description Aero middleware example demonstrating onion model and execution timing.
 */

import { Aero, type Middleware } from '../src/index.js';

const app = new Aero({ debug: true });

// 1. Response-Time Logger (Outer layer of onion)
const responseTimeMiddleware: Middleware = async (ctx, next) => {
  const start = Date.now();
  console.log(`[Middleware 1 ->] Request started for ${ctx.method} ${ctx.path}`);

  await next(); // Pass downstream

  const duration = Date.now() - start;
  ctx.set('X-Response-Time', `${duration}ms`);
  console.log(`[<- Middleware 1] Request completed in ${duration}ms`);
};

// 2. Request State Injector (Inner layer of onion)
const stateMiddleware: Middleware = async (ctx, next) => {
  console.log('[Middleware 2 ->] Injecting request metadata');
  ctx.state.requestId = Math.random().toString(36).slice(2, 9);
  ctx.set('X-Request-Id', ctx.state.requestId as string);

  await next(); // Pass downstream

  console.log('[<- Middleware 2] State cleaned up');
};

app.use(responseTimeMiddleware);
app.use(stateMiddleware);

// Route with route-specific auth guard middleware
const authGuard: Middleware = async (ctx, next) => {
  const token = ctx.header('authorization');
  if (token !== 'Bearer secret-key') {
    ctx.throw(401, 'Unauthorized: Valid token required');
  }
  await next();
};

app.get('/dashboard', authGuard, (ctx) => {
  ctx.json({
    status: 'access-granted',
    requestId: ctx.state.requestId,
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Aero 02-middleware listening on http://localhost:${PORT}`);
});
