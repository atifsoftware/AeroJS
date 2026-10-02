import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthCheck } from '../src/diagnostics/health-check.js';
import { PrometheusMetrics } from '../src/diagnostics/prometheus.js';
import { diagnosticsPlugin } from '../src/diagnostics/diagnostics-plugin.js';
import { Aero } from '../src/core/application.js';
import request from 'supertest';

describe('Enterprise Diagnostics & Metrics', () => {
  beforeEach(() => {
    // Reset singleton state for tests
    (HealthCheck as any).checks = new Map();
    (PrometheusMetrics as any).httpRequestsTotal = new Map();
    (PrometheusMetrics as any).httpRequestDurations = {};
    (PrometheusMetrics as any).activeWebsocketConnections = 0;
  });

  describe('Health Checks', () => {
    it('returns healthy status when all checks pass', async () => {
      HealthCheck.register('mock-db', async () => { return true; });
      HealthCheck.register('mock-redis', async () => { return true; });

      const report = await HealthCheck.run();
      expect(report.status).toBe('healthy');
      expect(report.checks['mock-db']?.status).toBe('up');
      expect(report.checks['mock-redis']?.status).toBe('up');
    });

    it('returns unhealthy and cascades failure on critical check failure', async () => {
      HealthCheck.register('critical-service', async () => { throw new Error('DB Down'); }, { critical: true });
      HealthCheck.register('non-critical-service', async () => { return true; }, { critical: false });

      const report = await HealthCheck.run();
      expect(report.status).toBe('unhealthy');
      expect(report.checks['critical-service']?.status).toBe('down');
      expect(report.checks['critical-service']?.message).toBe('DB Down');
      expect(report.checks['non-critical-service']?.status).toBe('up');
    });

    it('returns degraded status on non-critical check failure', async () => {
      HealthCheck.register('core-service', async () => { return true; }, { critical: true });
      HealthCheck.register('analytics-service', async () => { throw new Error('Timeout'); }, { critical: false });

      const report = await HealthCheck.run();
      expect(report.status).toBe('degraded');
      expect(report.checks['analytics-service']?.status).toBe('down');
    });

    it('handles check timeout', async () => {
      HealthCheck.register('slow-service', async () => {
        await new Promise(r => setTimeout(r, 100));
      }, { timeoutMs: 10, critical: true });

      const report = await HealthCheck.run();
      expect(report.status).toBe('unhealthy');
      expect(report.checks['slow-service']?.message).toBe('Timeout');
    });
  });

  describe('Prometheus Metrics', () => {
    it('records and formats http request metrics', () => {
      PrometheusMetrics.recordHttpRequest('GET', '/users', 200, 0.1);
      PrometheusMetrics.recordHttpRequest('GET', '/users', 200, 0.2);
      PrometheusMetrics.recordHttpRequest('POST', '/login', 401, 0.05);

      const metrics = PrometheusMetrics.generateMetrics();

      expect(metrics).toContain('http_requests_total{method="GET",path="/users",status="200"} 2');
      expect(metrics).toContain('http_requests_total{method="POST",path="/login",status="401"} 1');
      expect(metrics).toContain('http_request_duration_seconds_count{method="GET",path="/users"} 2');
      expect(metrics).toContain('nodejs_memory_heap_used_bytes');
    });

    it('tracks active websocket connections', () => {
      PrometheusMetrics.incrementWebsocketConnection();
      PrometheusMetrics.incrementWebsocketConnection();
      PrometheusMetrics.decrementWebsocketConnection();

      const metrics = PrometheusMetrics.generateMetrics();
      expect(metrics).toContain('active_websocket_connections_total 1');
    });
  });

  describe('Diagnostics Plugin Integration', () => {
    it('exposes /health and /metrics endpoints', async () => {
      const app = new Aero();
      app.useDiagnostics();
      app.onError((err, ctx) => {
        console.error('TEST ERROR:', err);
        ctx.res.status(500).send(err.message);
      });
      app.get('/api/test', (ctx) => ctx.res.status(200).send('ok'));

      const server = await app.listenAsync(0);

      // Hit an API route to generate metrics
      await request(server).get('/api/test').expect(200);
      await new Promise(r => setTimeout(r, 10));

      // Check health
      const resHealth = await request(server).get('/health').expect(200);
      expect(resHealth.body.status).toBe('healthy');
      expect(resHealth.body.uptime).toBeDefined();

      // Check metrics
      const resMetrics = await request(server).get('/metrics').expect(200);
      expect(resMetrics.headers['content-type']).toContain('text/plain');
      expect(resMetrics.text).toContain('http_requests_total{method="GET",path="/api/test",status="200"} 1');

      // Add a failing critical check and test 503
      HealthCheck.register('fail-db', () => { throw new Error('bad'); }, { critical: true });
      await request(server).get('/health').expect(503);
      await request(server).get('/health/readiness').expect(503);
      // Liveness should still return 200 because it doesn't run the deep checks, it just checks if the Node process is alive
      await request(server).get('/health/liveness').expect(200);

      await app.close();
    });
  });
});
