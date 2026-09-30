/**
 * @file 01-basic.ts
 * @description Aero basic usage example demonstrating routes, path params, and query strings.
 */

import { Aero } from '../src/index.js';

const app = new Aero({ debug: true });

// 1. Root route
app.get('/', (ctx) => {
  ctx.json({
    framework: 'Aero',
    tagline: "Fastify's performance. AdonisJS's DX. Express's simplicity.",
    status: 'running',
  });
});

// 2. Single path parameter
app.get('/hello/:name', (ctx) => {
  ctx.text(`Hello, ${ctx.params.name}!`);
});

// 3. Nested path parameters with query string
app.get('/users/:id/posts/:postId', (ctx) => {
  ctx.json({
    userId: ctx.params.id,
    postId: ctx.params.postId,
    query: ctx.query,
  });
});

// 4. Intentional error handling
app.get('/boom', (ctx) => {
  ctx.throw(500, 'Intentional server error');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Aero 01-basic listening on http://localhost:${PORT}`);
});
