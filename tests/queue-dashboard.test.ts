import { describe, it, expect, beforeEach } from 'vitest';
import { Aero, createTestClient, Queue, Job, QueueWorker } from '../src/index.js';

class ProcessPaymentJob extends Job {
  public async handle(): Promise<void> {
    // Succeeded
  }
}

class BrokenExportJob extends Job {
  public tries = 1;
  public async handle(): Promise<void> {
    throw new Error('Database connection timed out during CSV export');
  }
}

describe('Queue Horizon Dashboard & Job Management API', () => {
  let app: Aero;

  beforeEach(() => {
    Queue.reset();
    app = new Aero();
    app.useQueueDashboard('/__aero/queue');
  });

  it('renders dark-mode HTML dashboard on browser visits', async () => {
    const client = createTestClient(app);
    const res = await client.get('/__aero/queue');

    expect(res.status).toBe(200);
    expect(res.text()).toContain('<!DOCTYPE html>');
    expect(res.text()).toContain('AeroJS Queue Horizon');
    expect(res.text()).toContain('failed-jobs-container');
  });

  it('returns JSON metrics and failed list on Accept: application/json', async () => {
    const client = createTestClient(app);
    const res = await client.get('/__aero/queue', {
      headers: { accept: 'application/json' },
    });

    expect(res.status).toBe(200);
    const json = res.json();
    expect(json.metrics).toBeDefined();
    expect(json.metrics.pending).toBe(0);
    expect(Array.isArray(json.failed)).toBe(true);
  });

  it('tracks processed and failed jobs and exposes them via REST APIs', async () => {
    const client = createTestClient(app);
    const worker = Queue.createWorker({ sleepMs: 10 });
    worker.registerJob('ProcessPaymentJob', ProcessPaymentJob);
    worker.registerJob('BrokenExportJob', BrokenExportJob);

    // 1. Dispatch jobs
    await Queue.dispatch(new ProcessPaymentJob());
    await Queue.dispatch(new BrokenExportJob());

    // Run both jobs
    await worker.runNext(); // success
    await worker.runNext(); // failure

    // 2. Query /api/metrics
    const metricsRes = await client.get('/__aero/queue/api/metrics');
    expect(metricsRes.status).toBe(200);
    const metrics = metricsRes.json();
    expect(metrics.completed).toBe(1);
    expect(metrics.failed).toBe(1);

    // 3. Query /api/failed
    const failedRes = await client.get('/__aero/queue/api/failed');
    expect(failedRes.status).toBe(200);
    const failedList = failedRes.json();
    expect(failedList).toHaveLength(1);
    expect(failedList[0].jobName).toBe('BrokenExportJob');
    expect(failedList[0].exception).toContain('Database connection timed out');

    // 4. Retry failed job
    const failedId = failedList[0].id;
    const retryRes = await client.post(`/__aero/queue/api/retry/${failedId}`);
    expect(retryRes.status).toBe(200);
    expect(retryRes.json().success).toBe(true);

    // After retry, job is re-enqueued and removed from failed list
    const updatedFailed = await client.get('/__aero/queue/api/failed');
    expect(updatedFailed.json()).toHaveLength(0);

    const updatedMetrics = await client.get('/__aero/queue/api/metrics');
    expect(updatedMetrics.json().pending).toBe(1);
  });

  it('supports purge-all to clear dead letter queue', async () => {
    const client = createTestClient(app);
    QueueWorker.globalFailedJobs.push({
      id: 'job-999',
      queue: 'default',
      jobName: 'FailedTask',
      payload: '{}',
      attempts: 3,
      failedAt: new Date(),
      exception: 'Disk full error',
    });

    expect(Queue.getFailedJobs()).toHaveLength(1);

    const purgeRes = await client.delete('/__aero/queue/api/purge-all');
    expect(purgeRes.status).toBe(200);
    expect(purgeRes.json().success).toBe(true);

    expect(Queue.getFailedJobs()).toHaveLength(0);
  });

  it('restricts access when auth option returns false', async () => {
    const secureApp = new Aero();
    secureApp.useQueueDashboard('/secure-queue', {
      auth: (ctx) => ctx.req.headers['authorization'] === 'Bearer secret-admin-token',
    });

    const client = createTestClient(secureApp);

    // Unauthorized visit
    const unauth = await client.get('/secure-queue');
    expect(unauth.status).toBe(403);

    // Authorized visit
    const auth = await client.get('/secure-queue', {
      headers: { authorization: 'Bearer secret-admin-token' },
    });
    expect(auth.status).toBe(200);
  });
});
