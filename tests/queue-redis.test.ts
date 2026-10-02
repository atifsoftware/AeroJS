import { describe, it, expect, beforeEach } from 'vitest';
import { RedisQueueDriver } from '../src/queue/drivers/redis-queue-driver.js';
import { Queue, Job } from '../src/queue/index.js';

class MockRedisForQueue {
  public lists = new Map<string, string[]>();
  public hashes = new Map<string, Map<string, string>>();
  public sortedSets = new Map<string, Map<string, number>>();

  public async lpush(key: string, ...elements: (string | number)[]): Promise<number> {
    const list = this.lists.get(key) || [];
    for (const el of elements) {
      list.unshift(String(el));
    }
    this.lists.set(key, list);
    return list.length;
  }

  public async rpush(key: string, ...elements: (string | number)[]): Promise<number> {
    const list = this.lists.get(key) || [];
    for (const el of elements) {
      list.push(String(el));
    }
    this.lists.set(key, list);
    return list.length;
  }

  public async rpop(key: string): Promise<string | null> {
    const list = this.lists.get(key);
    if (!list || list.length === 0) return null;
    return list.pop() || null;
  }

  public async llen(key: string): Promise<number> {
    const list = this.lists.get(key);
    return list ? list.length : 0;
  }

  public async hset(key: string, field: string, value: string | number): Promise<number> {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    const isNew = !hash.has(field);
    hash.set(field, String(value));
    return isNew ? 1 : 0;
  }

  public async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashes.get(key);
    return hash?.get(field) ?? null;
  }

  public async hdel(key: string, ...fields: string[]): Promise<number> {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    let count = 0;
    for (const f of fields) {
      if (hash.delete(f)) count++;
    }
    return count;
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash.entries());
  }

  public async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.lists.delete(k)) count++;
      if (this.hashes.delete(k)) count++;
      if (this.sortedSets.delete(k)) count++;
    }
    return count;
  }

  public getRawConnection() {
    return {
      sendCommand: async (args: (string | number)[]) => {
        const cmd = String(args[0]).toUpperCase();
        if (cmd === 'ZADD') {
          const key = String(args[1]);
          const score = Number(args[2]);
          const member = String(args[3]);
          let zset = this.sortedSets.get(key);
          if (!zset) {
            zset = new Map();
            this.sortedSets.set(key, zset);
          }
          zset.set(member, score);
          return 1;
        }

        if (cmd === 'ZRANGEBYSCORE') {
          const key = String(args[1]);
          const maxScore = Number(args[3]);
          const zset = this.sortedSets.get(key);
          if (!zset) return [];
          const matches: string[] = [];
          for (const [member, score] of zset.entries()) {
            if (score <= maxScore) {
              matches.push(member);
            }
          }
          return matches;
        }

        if (cmd === 'ZREM') {
          const key = String(args[1]);
          const member = String(args[2]);
          const zset = this.sortedSets.get(key);
          if (!zset) return 0;
          return zset.delete(member) ? 1 : 0;
        }

        return null;
      },
    };
  }
}

class InvoiceProcessJob extends Job {
  public invoiceId: number;
  public processed = false;

  constructor(data: { invoiceId: number }) {
    super(data);
    this.invoiceId = data.invoiceId;
  }

  public async handle(): Promise<void> {
    this.processed = true;
  }
}

describe('RedisQueueDriver & Queue System', () => {
  let mockRedis: MockRedisForQueue;
  let driver: RedisQueueDriver;

  beforeEach(() => {
    mockRedis = new MockRedisForQueue();
    driver = new RedisQueueDriver(mockRedis as any);
  });

  it('pushes and pops jobs in FIFO order', async () => {
    const id1 = await driver.push(JSON.stringify({ order: 1 }));
    const id2 = await driver.push(JSON.stringify({ order: 2 }));

    expect(await driver.size()).toBe(2);

    const job1 = await driver.pop();
    expect(job1).toBeDefined();
    expect(job1?.id).toBe(id1);
    expect(JSON.parse(job1!.payload).order).toBe(1);

    const job2 = await driver.pop();
    expect(job2?.id).toBe(id2);
    expect(JSON.parse(job2!.payload).order).toBe(2);

    expect(await driver.pop()).toBeNull();
  });

  it('tracks popped jobs in reservation hash and deletes after completion', async () => {
    const id = await driver.push('sample payload');
    const job = await driver.pop();

    expect(job).not.toBeNull();
    const reserved = await mockRedis.hget('queue:default:reserved', String(id));
    expect(reserved).not.toBeNull();

    const deleted = await driver.delete(id);
    expect(deleted).toBe(true);

    const afterDelete = await mockRedis.hget('queue:default:reserved', String(id));
    expect(afterDelete).toBeNull();
  });

  it('releases job back to queue with delay or immediately', async () => {
    const id = await driver.push('retry payload');
    const job = await driver.pop();
    expect(job).not.toBeNull();

    // Release with 0 delay (immediate re-queue)
    const released = await driver.release(id, 0);
    expect(released).toBe(true);

    const jobRequeued = await driver.pop();
    expect(jobRequeued?.id).toBe(id);
  });

  it('supports delayed job scheduling with ZADD and automatic migration', async () => {
    const futureTimeInSeconds = 5;
    const id = await driver.push('delayed payload', { delay: futureTimeInSeconds });

    // Queue size should be 0 because it's delayed
    expect(await driver.size()).toBe(0);

    // Popping now returns null
    const immediatePop = await driver.pop();
    expect(immediatePop).toBeNull();

    // Fast-forward score in mock redis to simulate time passing
    const zset = mockRedis.sortedSets.get('queue:default:delayed');
    expect(zset).toBeDefined();

    for (const [member] of zset!.entries()) {
      zset!.set(member, Date.now() - 1000); // Set to past
    }

    // Next pop migrates the ready delayed job into main list
    const poppedAfterDelay = await driver.pop();
    expect(poppedAfterDelay).not.toBeNull();
    expect(poppedAfterDelay?.id).toBe(id);
  });

  it('handles permanent failures via Dead Letter Queue (DLQ)', async () => {
    const id = await driver.push('failing payload');
    await driver.pop();

    const failed = await driver.fail(id, new Error('Database connection crashed'));
    expect(failed).toBe(true);

    const dlqJobs = await driver.getFailed();
    expect(dlqJobs.length).toBe(1);
    expect(dlqJobs[0]!.id).toBe(id);
    expect(dlqJobs[0]!.error).toContain('Database connection crashed');
  });

  it('integrates with QueueManager configured for Redis', async () => {
    Queue.reset();
    Queue.configure({
      default: 'redis',
      connections: {
        redis: {
          driver: 'redis',
          redis: mockRedis as any,
        },
      },
    });

    Queue.registerJob('InvoiceProcessJob', InvoiceProcessJob);

    const job = new InvoiceProcessJob({ invoiceId: 999 });
    const dispatchId = await Queue.dispatch(job);

    expect(dispatchId).toBeDefined();
    expect(await Queue.driver().size()).toBe(1);
  });
});
