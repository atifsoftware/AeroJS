/**
 * @file worker.ts
 * @description QueueWorker for polling and processing background tasks in AeroJS.
 * Features automatic retries with backoff, failure hooks, and graceful termination.
 */

import type { QueueDriver, QueuedJobRecord } from './drivers/queue-driver.js';
import { Job } from './job.js';
import { Logger } from '../logging/logger.js';

export interface WorkerOptions {
  queue?: string;
  sleepMs?: number;
  maxTries?: number;
  backoffSeconds?: number;
  jobRegistry?: Record<string, new (...args: any[]) => Job>;
}

export class QueueWorker {
  private driver: QueueDriver;
  private queue: string;
  private sleepMs: number;
  private maxTries: number;
  private backoffSeconds: number;
  private jobRegistry: Map<string, new (...args: any[]) => Job>;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(driver: QueueDriver, options: WorkerOptions = {}) {
    this.driver = driver;
    this.queue = options.queue || 'default';
    this.sleepMs = options.sleepMs ?? 1000;
    this.maxTries = options.maxTries ?? 3;
    this.backoffSeconds = options.backoffSeconds ?? 5;
    this.jobRegistry = new Map();

    if (options.jobRegistry) {
      for (const [name, ctor] of Object.entries(options.jobRegistry)) {
        this.jobRegistry.set(name, ctor);
      }
    }
  }

  /**
   * Registers a Job constructor class with the worker so it can be instantiated by name.
   */
  public registerJob(name: string, jobClass: new (...args: any[]) => Job): this {
    this.jobRegistry.set(name, jobClass);
    return this;
  }

  /**
   * Processes the next available job synchronously/asynchronously.
   * Returns true if a job was processed, false if queue was empty.
   */
  public async runNext(): Promise<boolean> {
    const record = await this.driver.pop(this.queue);
    if (!record) return false;

    await this.processJob(record);
    return true;
  }

  /**
   * Starts a continuous background worker loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        const processed = await this.runNext();
        const delay = processed ? 10 : this.sleepMs;
        this.timer = setTimeout(loop, delay);
      } catch (err) {
        Logger.error('Unhandled error in QueueWorker loop', { error: err });
        this.timer = setTimeout(loop, this.sleepMs);
      }
    };

    loop();
  }

  /**
   * Gracefully stops the worker loop.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async processJob(record: QueuedJobRecord): Promise<void> {
    let payloadData: any;
    try {
      payloadData = JSON.parse(record.payload);
    } catch (parseErr) {
      Logger.error(`Malformed queue job payload for job #${record.id}`, { error: parseErr });
      await this.driver.delete(record.id, this.queue);
      return;
    }

    const { jobName, data, tries = this.maxTries } = payloadData;
    let jobInstance: any;

    if (this.jobRegistry.has(jobName)) {
      const JobClass = this.jobRegistry.get(jobName)!;
      jobInstance = new JobClass(data);
    } else if (typeof data?.handler === 'string') {
      // Inline function-style job or generic handler
      jobInstance = {
        handle: async () => Logger.info(`Executing generic job: ${jobName}`, data),
      };
    } else {
      jobInstance = {
        handle: async () => data,
      };
    }

    try {
      await jobInstance.handle();
      // Job succeeded -> remove from queue
      await this.driver.delete(record.id, this.queue);
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      Logger.warn(`Job #${record.id} (${jobName}) failed on attempt ${record.attempts}/${tries}`, {
        error: error.message,
      });

      if (record.attempts < tries) {
        // Retry with backoff
        const delay = this.backoffSeconds * record.attempts;
        await this.driver.release(record.id, delay, this.queue);
      } else {
        // Max retries reached -> call failed hook and remove
        if (typeof jobInstance.failed === 'function') {
          try {
            await jobInstance.failed(error);
          } catch (failedHookErr) {
            Logger.error(`Error in failed() hook for job #${record.id}`, { error: failedHookErr });
          }
        }
        await this.driver.delete(record.id, this.queue);
      }
    }
  }
}
