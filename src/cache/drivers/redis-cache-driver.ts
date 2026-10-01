import type { CacheDriver } from '../cache-driver.js';
import { RedisClient } from '../../redis/redis-client.js';

export class RedisCacheDriver implements CacheDriver {
  private client: RedisClient;
  private prefix: string;

  constructor(client: RedisClient, prefix = 'cache:') {
    this.client = client;
    this.prefix = prefix;
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  public async get<T = any>(key: string): Promise<T | null> {
    const res = await this.client.get(this.key(key));
    if (!res) return null;
    try {
      return JSON.parse(res) as T;
    } catch {
      return res as any as T;
    }
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.setex(this.key(key), ttlSeconds, payload);
    } else {
      await this.client.set(this.key(key), payload);
    }
  }

  public async has(key: string): Promise<boolean> {
    const exists = await this.client.exists(this.key(key));
    return exists === 1;
  }

  public async delete(key: string): Promise<boolean> {
    const deleted = await this.client.del(this.key(key));
    return deleted > 0;
  }

  public async clear(): Promise<void> {
    // In a real world scenario, you'd use SCAN to find keys matching the prefix and DEL them.
    // For simplicity, we flush the whole DB.
    await this.client.flushdb();
  }

  public async getMany(keys: string[]): Promise<Record<string, any>> {
    if (keys.length === 0) return {};
    const prefixedKeys = keys.map((k) => this.key(k));
    const results = await this.client.mget(...prefixedKeys);

    const record: Record<string, any> = {};
    for (let i = 0; i < keys.length; i++) {
      const val = results[i];
      if (val !== null) {
        try {
          record[keys[i] || ""] = JSON.parse(val as string);
        } catch {
          record[keys[i] || ""] = val;
        }
      }
    }
    return record;
  }

  public async setMany(entries: Record<string, any>, ttlSeconds?: number): Promise<void> {
    const itemsToSet: Record<string, string> = {};
    for (const [k, v] of Object.entries(entries)) {
      itemsToSet[this.key(k)] = JSON.stringify(v);
    }

    if (!ttlSeconds) {
      await this.client.mset(itemsToSet);
    } else {
      // Redis MSET doesn't support TTL, so we use pipeline or loop.
      // We will loop with setex for simplicity since we don't have a native MULTI pipeline yet.
      const promises = [];
      for (const [k, v] of Object.entries(itemsToSet)) {
        promises.push(this.client.setex(k, ttlSeconds, v));
      }
      await Promise.all(promises);
    }
  }

  public async increment(key: string, value = 1): Promise<number> {
    if (value === 1) {
      return this.client.incr(this.key(key));
    }
    return this.client.incrby(this.key(key), value);
  }

  public async decrement(key: string, value = 1): Promise<number> {
    if (value === 1) {
      return this.client.decr(this.key(key));
    }
    return this.client.decrby(this.key(key), value);
  }
}
