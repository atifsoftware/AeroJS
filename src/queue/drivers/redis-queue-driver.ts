import type { QueueDriver, QueuedJobRecord, PushOptions } from './queue-driver.js';
import { RedisClient } from '../../redis/redis-client.js';
import * as crypto from 'node:crypto';

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
      createdAt: new Date()
    };

    const serialized = JSON.stringify(jobRecord);

    if (delay > 0) {
      // In a full implementation we'd use ZADD for delayed jobs.
      // Since our simple client might not have ZADD exposed yet, we'll expose a raw command wrapper or add zadd
      // Let's use the raw command wrapper directly:
      await this.client.getRawConnection().sendCommand(['ZADD', this.delayedKey(queue), jobRecord.availableAt.getTime(), serialized]);
    } else {
      await this.client.lpush(this.queueKey(queue), serialized);
    }

    return id;
  }

  public async pop(queue: string = 'default'): Promise<QueuedJobRecord | null> {
    // First, migrate delayed jobs that are ready
    await this.migrateDelayedJobs(queue);

    const data = await this.client.rpop(this.queueKey(queue));
    if (!data) return null;

    const job = JSON.parse(data) as QueuedJobRecord;
    job.attempts += 1;
    job.reservedAt = new Date();

    return job;
  }

  public async delete(id: string | number, queue: string = 'default'): Promise<boolean> {
    // Since jobs are removed from the list when popped, delete is effectively a no-op
    // unless we were keeping them in a processing set.
    return true;
  }

  public async release(id: string | number, delaySeconds = 0, queue: string = 'default'): Promise<boolean> {
    // We don't have the job payload here directly in this API signature if we just use id.
    // In a full implementation, the QueueManager passes the whole job or payload, but QueueDriver release only takes ID.
    // This implies we need to store job state, or perhaps we just return false if we can't implement it perfectly without a payload.
    // Assuming we can't easily release without the payload unless we fetch it, but it was already popped.
    // This is a common flaw in simple interfaces. We will return false for now or throw.
    return false;
  }

  public async size(queue: string = 'default'): Promise<number> {
    return this.client.llen(this.queueKey(queue));
  }

  public async clear(queue: string = 'default'): Promise<void> {
    await this.client.del(this.queueKey(queue));
    await this.client.del(this.delayedKey(queue));
  }

  private async migrateDelayedJobs(queue: string) {
    const now = Date.now();
    // Using raw commands for ZRANGEBYSCORE and ZREM
    // ZRANGEBYSCORE key -inf <now>
    const readyJobs: string[] = await this.client.getRawConnection().sendCommand([
      'ZRANGEBYSCORE',
      this.delayedKey(queue),
      '-inf',
      now
    ]);

    if (readyJobs && readyJobs.length > 0) {
      for (const job of readyJobs) {
        // ZREM returns 1 if the element was removed, 0 if it was already removed by another worker
        const removed = await this.client.getRawConnection().sendCommand(['ZREM', this.delayedKey(queue), job]);
        if (removed === 1) {
          // Push only the jobs this worker successfully claimed
          await this.client.rpush(this.queueKey(queue), job);
        }
      }
    }
  }
}
