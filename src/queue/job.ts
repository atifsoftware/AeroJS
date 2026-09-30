/**
 * @file job.ts
 * @description Base Job class for AeroJS background task queue.
 */

export abstract class Job {
  public tries = 3;
  public delay = 0; // In seconds
  public timeout = 60; // In seconds
  [key: string]: any;

  constructor(data: Record<string, any> = {}) {
    Object.assign(this, data);
  }

  /**
   * Main execution handler for the queued job.
   */
  public abstract handle(): Promise<any>;

  /**
   * Lifecycle hook triggered when max retries are exhausted.
   */
  public async failed(error: Error): Promise<void> {
    // Optional override for alerting, audit logs, or notifications
  }
}
