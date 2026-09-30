/**
 * @file 03-hooks.ts
 * @description Aero lifecycle hooks example demonstrating all 8 hooks with execution logging.
 */

import { Aero } from '../src/index.js';

const app = new Aero({ debug: true });

// 1. onRequest
app.addHook('onRequest', (ctx) => {
  ctx.set('X-Start-Time', Date.now().toString());
  console.log(`1. [onRequest] Incoming ${ctx.method} ${ctx.path}`);
});

// 2. preParsing
app.addHook('preParsing', (ctx) => {
  console.log(`2. [preParsing] Before reading body stream for ${ctx.path}`);
});

// 3. preValidation
app.addHook('preValidation', (ctx) => {
  console.log(`3. [preValidation] Before validating payload for ${ctx.path}`);
});

// 4. preHandler
app.addHook('preHandler', (ctx) => {
  console.log(`4. [preHandler] Route guard executed for ${ctx.path}`);
});

// 5. preSerialization
app.addHook('preSerialization', (_ctx, payload) => {
  console.log('5. [preSerialization] Transforming payload before stringify');
  return payload;
});

// 6. onSend
app.addHook('onSend', (_ctx, payload) => {
  console.log('6. [onSend] Final payload dispatch ready');
  return payload;
});

// 7. onResponse
app.addHook('onResponse', (ctx) => {
  console.log(`7. [onResponse] Response flushed to client for ${ctx.path}`);
});

// 8. onError
app.addHook('onError', (err, ctx) => {
  console.error(`8. [onError] Caught exception on ${ctx.path}:`, err.message);
});

app.get('/test', (ctx) => {
  ctx.json({ ok: true, message: 'All hooks passed!' });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Aero 03-hooks listening on http://localhost:${PORT}`);
});
