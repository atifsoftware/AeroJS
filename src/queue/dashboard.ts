/**
 * @file dashboard.ts
 * @description Real-time interactive Queue & Job Monitoring Dashboard for AeroJS (Horizon-style).
 * Features live metrics, failed job inspection, retry mechanisms, and a dark-mode GUI.
 */

import { Router } from '../core/router.js';
import type { AeroContext } from '../core/context.js';
import { Queue } from './queue-manager.js';

export interface QueueDashboardOptions {
  /**
   * Optional authorization guard to restrict access to the dashboard.
   * If returns false, 403 Forbidden is returned.
   */
  auth?: (ctx: AeroContext) => boolean | Promise<boolean>;
  /**
   * Custom title displayed on the dashboard header.
   */
  title?: string;
  /**
   * Auto-refresh polling interval in seconds (default: 3).
   */
  pollInterval?: number;
}

/**
 * Renders the self-contained dark-mode single-page HTML dashboard for AeroJS Queue.
 */
export function renderQueueDashboardHtml(basePath: string, options: QueueDashboardOptions = {}): string {
  const title = options.title || 'AeroJS Queue Horizon';
  const pollInterval = (options.pollInterval || 3) * 1000;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(22, 29, 47, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.25);
      --purple: #8b5cf6;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #090d16 65%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      padding: 2rem 1.5rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--card-border);
    }
    .logo-area { display: flex; align-items: center; gap: 0.85rem; }
    .logo-badge {
      background: linear-gradient(135deg, var(--accent), var(--purple));
      color: #fff;
      font-weight: 800;
      font-size: 1.1rem;
      padding: 0.4rem 0.85rem;
      border-radius: 8px;
      letter-spacing: 0.05em;
      box-shadow: 0 0 20px var(--accent-glow);
    }
    h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.02em; }
    .live-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.25rem;
      backdrop-filter: blur(12px);
      transition: transform 0.2s, border-color 0.2s;
    }
    .stat-card:hover { transform: translateY(-2px); border-color: rgba(255, 255, 255, 0.18); }
    .stat-title { font-size: 0.82rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.06em; margin-bottom: 0.5rem; }
    .stat-val { font-size: 1.85rem; font-weight: 800; }
    .stat-val.pending { color: var(--accent); }
    .stat-val.completed { color: var(--success); }
    .stat-val.failed { color: var(--danger); }
    .stat-val.driver { color: var(--purple); font-size: 1.35rem; }

    .card-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.5rem;
      backdrop-filter: blur(12px);
      margin-bottom: 2rem;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
    }
    .panel-title { font-size: 1.15rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
    .actions-bar { display: flex; gap: 0.75rem; }

    .btn {
      padding: 0.45rem 0.9rem;
      border-radius: 7px;
      font-size: 0.85rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { background: rgba(239, 68, 68, 0.18); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.35); }
    .btn-danger:hover { background: var(--danger); color: #fff; }
    .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.78rem; }

    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th { text-align: left; padding: 0.75rem 1rem; color: var(--text-muted); font-weight: 600; border-bottom: 1px solid var(--card-border); }
    td { padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: top; }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .badge { padding: 0.2rem 0.5rem; border-radius: 5px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge-queue { background: rgba(139, 92, 246, 0.2); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.4); }
    .badge-tries { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }

    pre.stack-trace {
      background: #030712;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 0.6rem;
      margin-top: 0.5rem;
      font-size: 0.76rem;
      color: #f87171;
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-area">
        <div class="logo-badge">AERO</div>
        <h1>${title}</h1>
      </div>
      <div class="live-indicator">
        <div class="pulse-dot"></div>
        <span>Live Polling (${pollInterval / 1000}s)</span>
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">Pending Jobs</div>
        <div class="stat-val pending" id="stat-pending">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Completed Jobs</div>
        <div class="stat-val completed" id="stat-completed">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Failed (Dead Letter)</div>
        <div class="stat-val failed" id="stat-failed">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Queue Driver</div>
        <div class="stat-val driver" id="stat-driver">memory</div>
      </div>
    </div>

    <div class="card-panel">
      <div class="panel-header">
        <div class="panel-title">
          <span>Failed Jobs Management</span>
        </div>
        <div class="actions-bar">
          <button class="btn btn-primary" onclick="retryAll()">Retry All</button>
          <button class="btn btn-danger" onclick="purgeAll()">Purge All</button>
        </div>
      </div>

      <div id="failed-jobs-container">
        <div class="empty-state">Loading queue data...</div>
      </div>
    </div>
  </div>

  <script>
    const basePath = '${basePath}';

    async function fetchStats() {
      try {
        const res = await fetch(basePath + '/api/metrics');
        const data = await res.json();
        document.getElementById('stat-pending').innerText = data.pending ?? 0;
        document.getElementById('stat-completed').innerText = data.completed ?? 0;
        document.getElementById('stat-failed').innerText = data.failed ?? 0;
        document.getElementById('stat-driver').innerText = data.connection ?? 'default';
      } catch (err) {
        console.error('Failed to fetch queue metrics', err);
      }
    }

    async function fetchFailedJobs() {
      try {
        const res = await fetch(basePath + '/api/failed');
        const jobs = await res.json();
        renderFailedTable(jobs);
      } catch (err) {
        console.error('Failed to fetch failed jobs', err);
      }
    }

    function renderFailedTable(jobs) {
      const container = document.getElementById('failed-jobs-container');
      if (!jobs || jobs.length === 0) {
        container.innerHTML = '<div class="empty-state">All queues are healthy! No failed jobs.</div>';
        return;
      }

      let html = '<table><thead><tr>' +
        '<th>ID</th><th>Queue</th><th>Job Name</th><th>Failed At</th><th>Exception</th><th style="text-align:right">Actions</th>' +
        '</tr></thead><tbody>';

      for (const j of jobs) {
        const dateStr = new Date(j.failedAt).toLocaleString();
        html += '<tr>' +
          '<td><code>#' + j.id + '</code></td>' +
          '<td><span class="badge badge-queue">' + (j.queue || 'default') + '</span></td>' +
          '<td><strong>' + (j.jobName || 'Anonymous') + '</strong></td>' +
          '<td>' + dateStr + '</td>' +
          '<td><pre class="stack-trace">' + (j.exception || 'No exception stack') + '</pre></td>' +
          '<td style="text-align:right">' +
          '<button class="btn btn-primary btn-sm" onclick="retryJob(\\'' + j.id + '\\')">Retry</button> ' +
          '<button class="btn btn-danger btn-sm" onclick="deleteJob(\\'' + j.id + '\\')">Delete</button>' +
          '</td>' +
          '</tr>';
      }

      html += '</tbody></table>';
      container.innerHTML = html;
    }

    async function retryJob(id) {
      await fetch(basePath + '/api/retry/' + id, { method: 'POST' });
      refresh();
    }

    async function deleteJob(id) {
      await fetch(basePath + '/api/failed/' + id, { method: 'DELETE' });
      refresh();
    }

    async function retryAll() {
      await fetch(basePath + '/api/retry-all', { method: 'POST' });
      refresh();
    }

    async function purgeAll() {
      if (!confirm('Are you sure you want to purge all failed jobs?')) return;
      await fetch(basePath + '/api/purge-all', { method: 'DELETE' });
      refresh();
    }

    function refresh() {
      fetchStats();
      fetchFailedJobs();
    }

    refresh();
    setInterval(refresh, ${pollInterval});
  </script>
</body>
</html>`;
}

/**
 * Registers the Queue Horizon dashboard GUI and REST API endpoints onto an Aero application.
 */
export function registerQueueDashboard(
  app: any,
  basePath = '/__aero/queue',
  options: QueueDashboardOptions = {}
): void {
  const authMiddleware = async (ctx: AeroContext, next: () => Promise<void>) => {
    if (options.auth) {
      const allowed = await options.auth(ctx);
      if (!allowed) {
        ctx.status(403).json({ error: 'Forbidden: Unauthorized access to Queue Dashboard' });
        return;
      }
    }
    await next();
  };

  const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

  // HTML Dashboard
  app.get(cleanBase, authMiddleware, async (ctx: AeroContext) => {
    const accept = ctx.req.headers['accept'] || '';
    if (accept.includes('application/json')) {
      const metrics = await Queue.getMetrics();
      const failed = Queue.getFailedJobs();
      ctx.json({ metrics, failed });
      return;
    }
    ctx.html(renderQueueDashboardHtml(cleanBase, options));
  });

  // REST API: Metrics
  app.get(`${cleanBase}/api/metrics`, authMiddleware, async (ctx: AeroContext) => {
    const queueName = (ctx.query.queue as string) || 'default';
    const metrics = await Queue.getMetrics(queueName);
    ctx.json(metrics);
  });

  // REST API: Failed Jobs List
  app.get(`${cleanBase}/api/failed`, authMiddleware, async (ctx: AeroContext) => {
    const failed = Queue.getFailedJobs();
    ctx.json(failed);
  });

  // REST API: Retry Single Job
  app.post(`${cleanBase}/api/retry/:id`, authMiddleware, async (ctx: AeroContext) => {
    const id = ctx.params.id || '';
    const ok = await Queue.retryFailedJob(id);
    if (!ok) {
      ctx.status(404).json({ success: false, message: `Failed job #${id} not found` });
      return;
    }
    ctx.json({ success: true, message: `Job #${id} re-enqueued` });
  });

  // REST API: Delete Single Failed Job
  app.delete(`${cleanBase}/api/failed/:id`, authMiddleware, async (ctx: AeroContext) => {
    const id = ctx.params.id || '';
    const ok = Queue.deleteFailedJob(id);
    if (!ok) {
      ctx.status(404).json({ success: false, message: `Failed job #${id} not found` });
      return;
    }
    ctx.json({ success: true, message: `Failed job #${id} removed` });
  });

  // REST API: Retry All Failed Jobs
  app.post(`${cleanBase}/api/retry-all`, authMiddleware, async (ctx: AeroContext) => {
    const count = await Queue.retryAllFailedJobs();
    ctx.json({ success: true, retriedCount: count });
  });

  // REST API: Purge All Failed Jobs
  app.delete(`${cleanBase}/api/purge-all`, authMiddleware, async (ctx: AeroContext) => {
    Queue.purgeAllFailedJobs();
    ctx.json({ success: true, message: 'All failed jobs purged' });
  });
}
