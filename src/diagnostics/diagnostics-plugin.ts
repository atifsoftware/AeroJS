
import { HealthCheck } from './health-check.js';
import { PrometheusMetrics } from './prometheus.js';
import { SKIP_OVERRIDE } from '../plugins/plugin.js';

export interface DiagnosticsOptions {
  healthRoute?: string;
  livenessRoute?: string;
  readinessRoute?: string;
  metricsRoute?: string;
  enableHttpMetrics?: boolean;
}

export function diagnosticsPlugin(options: DiagnosticsOptions = {}) {
  const healthRoute = options.healthRoute || '/health';
  const livenessRoute = options.livenessRoute || '/health/liveness';
  const readinessRoute = options.readinessRoute || '/health/readiness';
  const metricsRoute = options.metricsRoute || '/metrics';
  const enableHttpMetrics = options.enableHttpMetrics !== false;

  const plugin = function (app: any) {
    if (enableHttpMetrics) {
      app.use(async (ctx: any, next: any) => {
        const start = process.hrtime.bigint();
        try {
          await next();
        } finally {
          if (ctx.req.path !== metricsRoute) {
            const end = process.hrtime.bigint();
            const durationMs = Number(end - start) / 1e6;
            const durationSeconds = durationMs / 1000;
            const routePath = ctx.route?.path || ctx.req.path;

            PrometheusMetrics.recordHttpRequest(
              ctx.req.method,
              routePath,
              ctx.res.statusCode,
              durationSeconds
            );
          }
        }
      });
    }

    app.get(healthRoute, async (ctx: any) => {
      const report = await HealthCheck.run();
      const status = report.status === 'healthy' ? 200 : 503;
      ctx.res.status(status).json(report);
    });

    app.get(livenessRoute, (ctx: any) => {
      ctx.res.status(200).json({ status: 'healthy', uptime: process.uptime() });
    });

    app.get(readinessRoute, async (ctx: any) => {
      const report = await HealthCheck.run();
      const status = report.status === 'healthy' ? 200 : 503;
      ctx.res.status(status).json(report);
    });

    app.get(metricsRoute, (ctx: any) => {
      const metricsText = PrometheusMetrics.generateMetrics();
      ctx.res.type('text/plain; version=0.0.4').send(metricsText);
    });
  };

  (plugin as any)[SKIP_OVERRIDE] = true;
  return plugin;
}
