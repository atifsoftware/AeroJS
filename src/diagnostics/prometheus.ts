/**
 * @file prometheus.ts
 * @description Zero-dependency Prometheus Metrics Exporter for AeroJS.
 */

import * as os from 'node:os';
import * as v8 from 'node:v8';

export class PrometheusMetrics {
  // Counters
  private static httpRequestsTotal = new Map<string, number>(); // key: method_path_status

  // Gauges
  public static activeWebsocketConnections = 0;

  // Histograms (Simplified with bucketed tracking or raw tracking)
  // For zero-dependency, we'll store recent raw durations to compute percentiles on scrape
  private static httpRequestDurations: Record<string, number[]> = {};
  private static MAX_DURATION_SAMPLES = 1000;

  public static recordHttpRequest(method: string, path: string, status: number, durationSeconds: number) {
    // Sanitize path for metrics cardinality (e.g. /users/123 -> /users/:id)
    // We assume the router matched path is used, if provided. For now, we use raw path or caller should provide matched route.

    const countKey = `${method}|${path}|${status}`;
    this.httpRequestsTotal.set(countKey, (this.httpRequestsTotal.get(countKey) || 0) + 1);

    const durKey = `${method}|${path}`;
    if (!this.httpRequestDurations[durKey]) {
      this.httpRequestDurations[durKey] = [];
    }
    this.httpRequestDurations[durKey].push(durationSeconds);
    if (this.httpRequestDurations[durKey].length > this.MAX_DURATION_SAMPLES) {
      // Keep recent samples, drop oldest
      this.httpRequestDurations[durKey].shift();
    }
  }

  public static incrementWebsocketConnection() {
    this.activeWebsocketConnections++;
  }

  public static decrementWebsocketConnection() {
    this.activeWebsocketConnections--;
  }

  private static calculatePercentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) return 0;
    const index = Math.ceil(p * sortedArr.length) - 1;
    return sortedArr[index] || 0;
  }

  /**
   * Generates metrics in Prometheus Text Exposition Format.
   */
  public static generateMetrics(): string {
    const lines: string[] = [];

    lines.push('# HELP http_requests_total Total number of HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    for (const [key, count] of this.httpRequestsTotal.entries()) {
      const [method, path, status] = key.split('|');
      lines.push(`http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`);
    }

    lines.push('');
    lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
    lines.push('# TYPE http_request_duration_seconds summary');
    for (const [key, durations] of Object.entries(this.httpRequestDurations)) {
      const [method, path] = key.split('|');

      const sorted = [...durations].sort((a, b) => a - b);
      const p50 = this.calculatePercentile(sorted, 0.50);
      const p90 = this.calculatePercentile(sorted, 0.90);
      const p99 = this.calculatePercentile(sorted, 0.99);

      const sum = durations.reduce((a, b) => a + b, 0);
      const count = durations.length;

      lines.push(`http_request_duration_seconds{method="${method}",path="${path}",quantile="0.5"} ${p50}`);
      lines.push(`http_request_duration_seconds{method="${method}",path="${path}",quantile="0.9"} ${p90}`);
      lines.push(`http_request_duration_seconds{method="${method}",path="${path}",quantile="0.99"} ${p99}`);
      lines.push(`http_request_duration_seconds_sum{method="${method}",path="${path}"} ${sum}`);
      lines.push(`http_request_duration_seconds_count{method="${method}",path="${path}"} ${count}`);
    }

    lines.push('');
    lines.push('# HELP nodejs_memory_heap_used_bytes Memory heap used in bytes');
    lines.push('# TYPE nodejs_memory_heap_used_bytes gauge');
    const heapStats = v8.getHeapStatistics();
    lines.push(`nodejs_memory_heap_used_bytes ${heapStats.used_heap_size}`);

    lines.push('');
    lines.push('# HELP nodejs_cpu_utilization_ratio CPU utilization ratio');
    lines.push('# TYPE nodejs_cpu_utilization_ratio gauge');
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (const cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice;
      sys += cpu.times.sys;
      idle += cpu.times.idle;
      irq += cpu.times.irq;
    }
    const total = user + nice + sys + idle + irq;
    // Calculate simple overall non-idle ratio
    const usage = total > 0 ? (total - idle) / total : 0;
    lines.push(`nodejs_cpu_utilization_ratio ${usage.toFixed(4)}`);

    lines.push('');
    lines.push('# HELP active_websocket_connections_total Number of active WebSocket connections');
    lines.push('# TYPE active_websocket_connections_total gauge');
    lines.push(`active_websocket_connections_total ${this.activeWebsocketConnections}`);

    return lines.join('\n') + '\n';
  }
}
