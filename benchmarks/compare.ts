/**
 * @file compare.ts
 * @description Performance benchmark measuring Radix Router, Middleware Pipeline,
 * Schema Validation, and In-Process Request throughput in Aero.
 */

import { performance } from 'node:perf_hooks';
import {
  Aero,
  Router,
  compose,
  validateSchema,
  compileFastSerializer,
  createTestClient,
} from '../src/index.js';

async function runBenchmarks() {
  console.log('====================================================');
  console.log('🚀 AERO FRAMEWORK CORE PERFORMANCE BENCHMARKS');
  console.log(`Node.js Runtime: ${process.version} | Architecture: ${process.arch}`);
  console.log('====================================================\n');

  // 1. Radix Tree Router Benchmark
  const router = new Router();
  router.add('GET', '/users', [() => {}]);
  router.add('GET', '/users/:id', [() => {}]);
  router.add('GET', '/users/:id/posts/:postId', [() => {}]);
  router.add('POST', '/users/:id/posts', [() => {}]);
  router.add('GET', '/static/*filePath', [() => {}]);

  const ROUTE_RUNS = 1_000_000;
  const startRouter = performance.now();
  for (let i = 0; i < ROUTE_RUNS; i++) {
    router.match('GET', '/users/42/posts/999');
  }
  const routerDuration = performance.now() - startRouter;
  const routerOpsSec = Math.floor((ROUTE_RUNS / routerDuration) * 1000);

  console.log('1. Radix Tree Param Matching:');
  console.log(`   - Operations: ${ROUTE_RUNS.toLocaleString()}`);
  console.log(`   - Time:       ${routerDuration.toFixed(2)} ms`);
  console.log(`   - Throughput: ${routerOpsSec.toLocaleString()} ops/sec\n`);

  // 2. Onion Middleware Pipeline Benchmark
  const m1 = async (_ctx: any, next: any) => { await next(); };
  const m2 = async (_ctx: any, next: any) => { await next(); };
  const m3 = async (ctx: any) => { ctx.state.done = true; };
  const pipeline = compose([m1, m2, m3]);
  const dummyCtx: any = { state: {} };

  const PIPELINE_RUNS = 1_000_000;
  const startPipeline = performance.now();
  for (let i = 0; i < PIPELINE_RUNS; i++) {
    await pipeline(dummyCtx);
  }
  const pipelineDuration = performance.now() - startPipeline;
  const pipelineOpsSec = Math.floor((PIPELINE_RUNS / pipelineDuration) * 1000);

  console.log('2. Onion Middleware Composition (3 layers):');
  console.log(`   - Operations: ${PIPELINE_RUNS.toLocaleString()}`);
  console.log(`   - Time:       ${pipelineDuration.toFixed(2)} ms`);
  console.log(`   - Throughput: ${pipelineOpsSec.toLocaleString()} ops/sec\n`);

  // 3. Fast JSON Serializer Benchmark
  const schema = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      username: { type: 'string' },
      active: { type: 'boolean' },
    },
  };
  const fastSerializer = compileFastSerializer(schema);
  const sampleData = { id: 101, username: 'architect_01', active: true, extra: 'omit' };

  const SERIAL_RUNS = 1_000_000;
  const startSerial = performance.now();
  for (let i = 0; i < SERIAL_RUNS; i++) {
    fastSerializer(sampleData);
  }
  const serialDuration = performance.now() - startSerial;
  const serialOpsSec = Math.floor((SERIAL_RUNS / serialDuration) * 1000);

  console.log('3. Fast JSON Serialization (Schema-guided):');
  console.log(`   - Operations: ${SERIAL_RUNS.toLocaleString()}`);
  console.log(`   - Time:       ${serialDuration.toFixed(2)} ms`);
  console.log(`   - Throughput: ${serialOpsSec.toLocaleString()} ops/sec\n`);

  // 4. In-Process Full Request-Response Cycle
  const app = new Aero();
  app.get('/api/fast', (ctx) => {
    ctx.json({ ok: true, timestamp: Date.now() });
  });

  const client = createTestClient(app);
  const REQ_RUNS = 20_000;
  const startReq = performance.now();
  for (let i = 0; i < REQ_RUNS; i++) {
    await client.get('/api/fast');
  }
  const reqDuration = performance.now() - startReq;
  const reqOpsSec = Math.floor((REQ_RUNS / reqDuration) * 1000);

  console.log('4. Full Request Lifecycle (In-Process TestClient):');
  console.log(`   - Requests:   ${REQ_RUNS.toLocaleString()}`);
  console.log(`   - Time:       ${reqDuration.toFixed(2)} ms`);
  console.log(`   - Throughput: ${reqOpsSec.toLocaleString()} reqs/sec\n`);

  console.log('====================================================');
  console.log('✨ Benchmark completed successfully.');
  console.log('====================================================');
}

runBenchmarks().catch(console.error);
