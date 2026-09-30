/**
 * @file basic.ts
 * @description Basic usage example for the Aero web framework.
 */

import { Aero } from '../src/index.js';

const app = new Aero({
  debug: true,
});

// Global Onion Middleware 1: Request Logger & Response Timer
app.use(async (ctx, next) => {
  const start = Date.now();
  console.log(`[Middleware ->] ${ctx.method} ${ctx.path}`);

  await next();

  const duration = Date.now() - start;
  ctx.set('X-Response-Time', `${duration}ms`);
  console.log(`[<- Middleware] ${ctx.method} ${ctx.path} finished in ${duration}ms`);
});

// Global Onion Middleware 2: Request State Injector
app.use(async (ctx, next) => {
  ctx.state.requestId = Math.random().toString(36).substring(2, 9);
  ctx.set('X-Request-Id', ctx.state.requestId as string);
  await next();
});

// Route 1: Root endpoint
app.get('/', (ctx) => {
  ctx.json({
    framework: 'Aero',
    status: 'running',
    message: 'Welcome to Aero — fast, minimal, elegant Node.js web framework!',
    version: '0.1.0',
    requestId: ctx.state.requestId,
  });
});

// Route 2: Single path parameter
app.get('/hello/:name', (ctx) => {
  const name = ctx.params.name ?? 'stranger';
  ctx.json({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  });
});

// Route 3: Multi-level nested path parameters
app.get('/users/:id/posts/:postId', (ctx) => {
  ctx.json({
    userId: ctx.params.id,
    postId: ctx.params.postId,
    query: ctx.query,
  });
});

// Route 4: Intentional error triggering default Aero error handling
app.get('/boom', (ctx) => {
  ctx.throw(500, 'Boom! Something intentionally went wrong.');
});

// Route 5: Protected route with custom auth check
app.get('/protected', (ctx) => {
  const authHeader = ctx.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.throw(401, 'Unauthorized: Missing or invalid Bearer token');
  }

  ctx.json({
    status: 'success',
    secretData: 'Confidential framework metrics',
    user: 'authenticated-client',
  });
});

// Route 6: Body parser demo
app.post('/echo', (ctx) => {
  ctx.status(201).json({
    received: ctx.body,
    headers: {
      contentType: ctx.header('content-type'),
    },
  });
});

// Route 7: Cookie handling demo
app.get('/cookie', (ctx) => {
  const currentSession = ctx.cookies['sessionId'];
  if (!currentSession) {
    const newSession = `session-${Math.random().toString(36).substring(2, 9)}`;
    ctx.cookie('sessionId', newSession, { httpOnly: true, maxAge: 3600 });
    ctx.json({ session: newSession, created: true });
  } else {
    ctx.json({ session: currentSession, created: false });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Aero basic example listening on http://localhost:${PORT}`);
});
