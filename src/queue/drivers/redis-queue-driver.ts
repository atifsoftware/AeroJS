/**
 * @file redis-queue-driver.ts
 * @description Production-grade Redis Queue Driver for AeroJS.
 * Supports FIFO queueing (LPUSH/RPOP), delayed dispatch (ZADD/ZRANGEBYSCORE),
 * job reservation tracking (HSET), release with backoff retry, and DLQ (Dead Letter Queue).
 */

import type { QueueDriver, QueuedJobRecord, PushOptions } from './queue-driver.js';
import { RedisClient } from '../../redis/redis-client.js';
import * as crypto from 'node:crypto';

export interface FailedJobDetails extends QueuedJobRecord {
  failedAt: Date;
  error?: string;
}

export class RedisQueueDriver implements QueueDriver {
  private client: RedisClient;

  constructor(client: RedisClient) {
    this.client = client;
  }

  private queueKey(queue: string): string {
    return `queue:${queue}`;
  }

  private delayedKey(queue: string): string {
    return `queue:${queue}:delayed`;
  }

  private reservedKey(queue: string): string {
    return `queue:${queue}:reserved`;
  }

  private failedKey(queue: string): string {
    return `queue:${queue}:failed`;
  }

  public async push(payload: string, options?: PushOptions): Promise<string | number> {
    const queue = options?.queue || 'default';
    const delay = options?.delay || 0;
    const id = crypto.randomUUID();

    const jobRecord: QueuedJobRecord = {
      id,
      queue,
      payload,
      attempts: 0,
      reservedAt: null,
      availableAt: new Date(Date.now() + delay * 1000),
      createdAt: new Date(),
    };

    const serialized = JSON.stringify(jobRecord);

    if (delay > 0) {
      await this.client.getRawConnection().sendCommand([
        'ZADD',
        this.delayedKey(queue),
        jobRecord.availableAt.getTime(),
        serialized,
      ]);
    } else {
      await this.client.lpush(this.queueKey(queue), serialized);
    }

    return id;
  }

  public async pop(queue: string = 'default'): Promise<QueuedJobRecord | null> {
    // 1. Migrate delayed jobs that are ready to run
    await this.migrateDelayedJobs(queue);

    // 2. Pop next available job
    const data = await this.client.rpop(this.queueKey(queue));
    if (!data) return null;

    const job = JSON.parse(data) as QueuedJobRecord;
    job.attempts += 1;
    job.reservedAt = new Date();

    // 3. Track in reserved hash while worker is processing
    await this.client.hset(this.reservedKey(queue), String(job.id), JSON.stringify(job));

    return job;
  }

  public async delete(id: string | number, queue: string = 'default'): Promise<boolean> {
    const deleted = await this.client.hdel(this.reservedKey(queue), String(id));
    return deleted > 0;
  }

  public async release(id: string | number, delaySeconds = 0, queue: string = 'default'): Promise<boolean> {
    const raw = await this.client.hget(this.reservedKey(queue), String(id));
    if (!raw) return false;

    // Remove from reserved
    await this.client.hdel(this.reservedKey(queue), String(id));

    const job = JSON.parse(raw) as QueuedJobRecord;
    job.reservedAt = null;
    job.availableAt = new Date(Date.now() + delaySeconds * 1000);

    const serialized = JSON.stringify(job);

    if (delaySeconds > 0) {
      await this.client.getRawConnection().sendCommand([
        'ZADD',
        this.delayedKey(queue),
        job.availableAt.getTime(),
        serialized,
      ]);
    } else {
      await this.client.lpush(this.queueKey(queue), serialized);
    }

    return true;
  }

  /**
   * Moves a permanently failed job to Dead Letter Queue (DLQ).
   */
  public async fail(id: string | number, error?: any, queue: string = 'default'): Promise<boolean> {
    const raw = await this.client.hget(this.reservedKey(queue), String(id));
    if (!raw) return false;

    await this.client.hdel(this.reservedKey(queue), String(id));

    const job = JSON.parse(raw) as QueuedJobRecord;
    const failedRecord: FailedJobDetails = {
      ...job,
      failedAt: new Date(),
      error: error instanceof Error ? error.stack || error.message : String(error || 'Unknown error'),
    };

    await this.client.hset(this.failedKey(queue), String(id), JSON.stringify(failedRecord));
    return true;
  }

  /**
   * Retrieves all failed jobs from the Dead Letter Queue.
   */
  public async getFailed(queue: string = 'default'): Promise<FailedJobDetails[]> {
    const records = await this.client.hgetall(this.failedKey(queue));
    return Object.values(records).map((r) => JSON.parse(r) as FailedJobDetails);
  }

  public async size(queue: string = 'default'): Promise<number> {
    return await this.client.llen(this.queueKey(queue));
  }

  public async clear(queue: string = 'default'): Promise<void> {
    await this.client.del(
      this.queueKey(queue),
      this.delayedKey(queue),
      this.reservedKey(queue),
      this.failedKey(queue)
    );
  }

  private async migrateDelayedJobs(queue: string): Promise<void> {
    const now = Date.now();
    try {
      const readyJobs: string[] = await this.client.getRawConnection().sendCommand([
        'ZRANGEBYSCORE',
        this.delayedKey(queue),
        '-inf',
        now,
      ]);

      if (readyJobs && readyJobs.length > 0) {
        for (const job of readyJobs) {
          const removed = await this.client.getRawConnection().sendCommand([
            'ZREM',
            this.delayedKey(queue),
            job,
          ]);
          if (removed === 1) {
            await this.client.rpush(this.queueKey(queue), job);
          }
        }
      }
    } catch {
      // In case sorted set does not exist yet
    }
  }
}
