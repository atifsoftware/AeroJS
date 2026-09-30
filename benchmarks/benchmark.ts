/**
 * @file benchmark.ts
 * @description Performance benchmark comparing Aero router and pipeline throughput.
 */

import { Router } from '../src/router.js';
import { compose } from '../src/middleware.js';
import { AeroContext } from '../src/context.js';
import { EventEmitter } from 'node:events';

function createMockContext(path: string, method = 'GET') {
  const req = Object.assign(new EventEmitter(), {
    method,
    url: path,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  });

  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader: () => {},
    getHeader: () => undefined,
    removeHeader: () => {},
    end: () => {},
  });

  return new AeroContext(req as any, res as any);
}

async function runBenchmark() {
  console.log('⚡ Aero Web Framework - Performance Benchmarks\n');

  // Benchmark 1: Radix Tree Route Matching
  const router = new Router();
  router.add('GET', '/users', [() => {}]);
  router.add('GET', '/users/:id', [() => {}]);
  router.add('GET', '/users/:id/posts/:postId', [() => {}]);
  router.add('POST', '/users/:id/posts', [() => {}]);
  router.add('GET', '/static/*', [() => {}]);

  const MATCH_ITERATIONS = 500_000;
  console.log(`Running ${MATCH_ITERATIONS.toLocaleString()} route matches...`);

  const startMatch = performance.now();
  for (let i = 0; i < MATCH_ITERATIONS; i++) {
    router.match('GET', '/users/42/posts/101');
  }
  const matchDuration = performance.now() - startMatch;
  const matchOpsPerSec = Math.floor((MATCH_ITERATIONS / matchDuration) * 1000);

  console.log(`  Duration: ${matchDuration.toFixed(2)} ms`);
  console.log(`  Throughput: ${matchOpsPerSec.toLocaleString()} ops/sec\n`);

  // Benchmark 2: Onion Middleware Execution
  const mw1 = async (_ctx: any, next: any) => { await next(); };
  const mw2 = async (_ctx: any, next: any) => { await next(); };
  const mw3 = async (ctx: any) => { ctx.state.ready = true; };

  const pipeline = compose([mw1, mw2, mw3]);
  const ctx = createMockContext('/users/42/posts/101');

  const MW_ITERATIONS = 300_000;
  console.log(`Running ${MW_ITERATIONS.toLocaleString()} onion middleware pipeline executions...`);

  const startMw = performance.now();
  for (let i = 0; i < MW_ITERATIONS; i++) {
    await pipeline(ctx);
  }
  const mwDuration = performance.now() - startMw;
  const mwOpsPerSec = Math.floor((MW_ITERATIONS / mwDuration) * 1000);

  console.log(`  Duration: ${mwDuration.toFixed(2)} ms`);
  console.log(`  Throughput: ${mwOpsPerSec.toLocaleString()} ops/sec\n`);

  // Benchmark Summary Comparison
  console.log('📊 Framework Architecture Comparison:');
  console.log('┌───────────┬─────────────────┬────────────────────┬──────────────────────┐');
  console.log('│ Framework │ Routing Engine  │ Middleware Model   │ Dependencies         │');
  console.log('├───────────┼─────────────────┼────────────────────┼──────────────────────┤');
  console.log('│ Aero      │ Radix Tree O(k) │ Onion (Async/Koa)  │ 0 (Pure Node.js)     │');
  console.log('│ Fastify   │ Radix Tree      │ Linear Hooks       │ ~25 runtime packages │');
  console.log('│ Express 4 │ Regex Array     │ Linear Callback    │ ~30 runtime packages │');
  console.log('│ Koa       │ External Router │ Onion (Async)      │ ~40 runtime packages │');
  console.log('└───────────┴─────────────────┴────────────────────┴──────────────────────┘');
}

runBenchmark().catch(console.error);
