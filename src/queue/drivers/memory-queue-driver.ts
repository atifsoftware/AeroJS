/**
 * @file memory-queue-driver.ts
 * @description In-memory background task queue driver for AeroJS.
 * Ideal for local development, fast unit tests, and lightweight concurrency.
 */

import type { QueueDriver, QueuedJobRecord, PushOptions } from './queue-driver.js';

export class MemoryQueueDriver implements QueueDriver {
  private jobs = new Map<string, QueuedJobRecord[]>();
  private nextId = 1;

  public async push(payload: string, options: PushOptions = {}): Promise<string | number> {
    const queue = options.queue || 'default';
    const id = this.nextId++;
    const now = new Date();
    const delayMs = (options.delay || 0) * 1000;
    const availableAt = new Date(now.getTime() + delayMs);

    const record: QueuedJobRecord = {
      id,
      queue,
      payload,
      attempts: 0,
      reservedAt: null,
      availableAt,
      createdAt: now,
    };

    if (!this.jobs.has(queue)) {
      this.jobs.set(queue, []);
    }
    this.jobs.get(queue)!.push(record);

    return id;
  }

  public async pop(queue = 'default'): Promise<QueuedJobRecord | null> {
    const queueList = this.jobs.get(queue);
    if (!queueList || queueList.length === 0) return null;

    const now = new Date();
    const index = queueList.findIndex(
      (job) => job.reservedAt === null && job.availableAt <= now
    );

    if (index === -1) return null;

    const job = queueList[index]!;
    job.reservedAt = now;
    job.attempts += 1;
    return { ...job };
  }

  public async delete(id: string | number, queue = 'default'): Promise<boolean> {
    const queueList = this.jobs.get(queue);
    if (!queueList) return false;

    const initialLength = queueList.length;
    const filtered = queueList.filter((j) => j.id !== id);
    this.jobs.set(queue, filtered);
    return filtered.length < initialLength;
  }

  public async release(id: string | number, delaySeconds = 0, queue = 'default'): Promise<boolean> {
    const queueList = this.jobs.get(queue);
    if (!queueList) return false;

    const job = queueList.find((j) => j.id === id);
    if (!job) return false;

    job.reservedAt = null;
    job.availableAt = new Date(Date.now() + delaySeconds * 1000);
    return true;
  }

  public async size(queue = 'default'): Promise<number> {
    const queueList = this.jobs.get(queue);
    return queueList ? queueList.length : 0;
  }

  public async clear(queue = 'default'): Promise<void> {
    this.jobs.set(queue, []);
  }
}
