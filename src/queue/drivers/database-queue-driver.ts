/**
 * @file database-queue-driver.ts
 * @description Database-backed persistent queue broker for AeroJS.
 * Persists background tasks to the 'jobs' table with retry attempts, backoff, and reserved tracking.
 */

import { Database } from '../../database/connection.js';
import type { QueueDriver, QueuedJobRecord, PushOptions } from './queue-driver.js';

export class DatabaseQueueDriver implements QueueDriver {
  private tableName: string;
  private connection: string;

  constructor(options: { table?: string; connection?: string } = {}) {
    this.tableName = options.table || 'aero_jobs';
    this.connection = options.connection || 'default';
  }

  public async push(payload: string, options: PushOptions = {}): Promise<string | number> {
    const queue = options.queue || 'default';
    const now = new Date();
    const delayMs = (options.delay || 0) * 1000;
    const availableAt = new Date(now.getTime() + delayMs).toISOString();

    const res = await Database.table(this.tableName, this.connection).insert({
      queue,
      payload,
      attempts: 0,
      reserved_at: null,
      available_at: availableAt,
      created_at: now.toISOString(),
    });

    return res.insertId || Date.now();
  }

  public async pop(queue = 'default'): Promise<QueuedJobRecord | null> {
    const now = new Date().toISOString();

    const row = await Database.table(this.tableName, this.connection)
      .where('queue', queue)
      .whereNull('reserved_at')
      .where('available_at', '<=', now)
      .orderBy('id', 'ASC')
      .first();

    if (!row) return null;

    // Reserve the job
    const attempts = Number(row.attempts || 0) + 1;
    await Database.table(this.tableName, this.connection)
      .where('id', row.id)
      .update({
        reserved_at: now,
        attempts,
      });

    return {
      id: row.id,
      queue: row.queue,
      payload: row.payload,
      attempts,
      reservedAt: new Date(now),
      availableAt: new Date(row.available_at),
      createdAt: new Date(row.created_at),
    };
  }

  public async delete(id: string | number): Promise<boolean> {
    const deleted = await Database.table(this.tableName, this.connection)
      .where('id', id)
      .delete();
    return deleted > 0;
  }

  public async release(id: string | number, delaySeconds = 0): Promise<boolean> {
    const availableAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    const updated = await Database.table(this.tableName, this.connection)
      .where('id', id)
      .update({
        reserved_at: null,
        available_at: availableAt,
      });
    return updated > 0;
  }

  public async size(queue = 'default'): Promise<number> {
    return await Database.table(this.tableName, this.connection)
      .where('queue', queue)
      .count();
  }

  public async clear(queue = 'default'): Promise<void> {
    await Database.table(this.tableName, this.connection)
      .where('queue', queue)
      .delete();
  }
}
