/**
 * @file health-check.ts
 * @description Enterprise-grade Health Checks Manager for AeroJS.
 * Generates RFC-compliant Kubernetes health check JSON responses.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';

export interface HealthCheckOptions {
  timeoutMs?: number;
  critical?: boolean;
}

export type HealthCheckFunction = () => Promise<any> | any;

export interface HealthCheckResult {
  name: string;
  status: 'up' | 'down';
  critical: boolean;
  message?: string;
  durationMs: number;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  checks: Record<string, Omit<HealthCheckResult, 'name'>>;
}

export class HealthCheck {
  private static checks = new Map<string, { fn: HealthCheckFunction; options: HealthCheckOptions }>();

  /**
   * Registers a new diagnostic health check.
   */
  public static register(name: string, checkFn: HealthCheckFunction, options: HealthCheckOptions = {}) {
    this.checks.set(name, {
      fn: checkFn,
      options: { timeoutMs: 5000, critical: true, ...options }
    });
  }

  /**
   * Executes all registered health checks.
   */
  public static async run(): Promise<HealthReport> {
    const promises = Array.from(this.checks.entries()).map(async ([name, check]) => {
      const start = performance.now();
      let status: 'up' | 'down' = 'up';
      let message: string | undefined;

      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), check.options.timeoutMs);
        });

        await Promise.race([check.fn(), timeoutPromise]);
      } catch (err: any) {
        status = 'down';
        message = err.message || String(err);
      }

      const durationMs = Math.round(performance.now() - start);

      return {
        name,
        status,
        critical: check.options.critical!,
        message,
        durationMs
      } as HealthCheckResult;
    });

    const results = await Promise.all(promises);
    const checks: Record<string, Omit<HealthCheckResult, 'name'>> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    for (const res of results) {
      checks[res.name] = {
        status: res.status,
        critical: res.critical,
        message: res.message,
        durationMs: res.durationMs
      };

      if (res.status === 'down') {
        if (res.critical) {
          overallStatus = 'unhealthy';
        } else if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      }
    }

    return {
      status: overallStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks
    };
  }

  // --- Pre-built Common Checks ---

  /**
   * Verifies database connectivity.
   */
  public static databaseCheck(dbInstance: any) {
    return async () => {
      if (typeof dbInstance.query === 'function') {
        await dbInstance.query('SELECT 1');
      } else if (typeof dbInstance.raw === 'function') {
        await dbInstance.raw('SELECT 1');
      } else if (typeof dbInstance.$queryRawUnsafe === 'function') {
        await dbInstance.$queryRawUnsafe('SELECT 1');
      }
    };
  }

  /**
   * Verifies Redis connectivity.
   */
  public static redisCheck(redisClient: any) {
    return async () => {
      const res = await redisClient.sendCommand(['PING']);
      if (res !== 'PONG') throw new Error('Redis did not respond with PONG');
    };
  }

  /**
   * Verifies that the disk is writable.
   */
  public static diskWriteCheck(directory = './storage') {
    return async () => {
      const testFile = `${directory}/.healthcheck-${Date.now()}`;
      await fs.promises.mkdir(directory, { recursive: true });
      await fs.promises.writeFile(testFile, 'ok');
      await fs.promises.unlink(testFile);
    };
  }

  /**
   * Verifies system memory usage is below a certain threshold.
   */
  public static memoryCheck(maxHeapUsedBytes: number) {
    return () => {
      const usage = process.memoryUsage();
      if (usage.heapUsed > maxHeapUsedBytes) {
        throw new Error(`Memory heap used (${usage.heapUsed} bytes) exceeds threshold (${maxHeapUsedBytes} bytes)`);
      }
    };
  }
}
