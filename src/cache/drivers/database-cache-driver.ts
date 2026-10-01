/**
 * @file database-cache-driver.ts
 * @description Database backed CacheDriver utilizing AeroJS QueryBuilder.
 */

import { DB } from '../../database/index.js';
import type { CacheDriver } from '../cache-driver.js';

export class DatabaseCacheDriver implements CacheDriver {
  private tableName = 'aero_cache';

  public async get<T = any>(key: string): Promise<T | null> {
    try {
      const row = await DB.table(this.tableName).where('key', key).first();
      if (!row) return null;

      const expiration = row.expiration as number | null;
      if (expiration !== null && expiration <= Date.now()) {
        await this.delete(key);
        return null;
      }

      return JSON.parse(row.value as string) as T;
    } catch {
      return null;
    }
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const expiration = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    const serializedValue = JSON.stringify(value);

    const exists = await DB.table(this.tableName).where('key', key).first();

    if (exists) {
      await DB.table(this.tableName).where('key', key).update({
        value: serializedValue,
        expiration,
      });
    } else {
      await DB.table(this.tableName).insert({
        key,
        value: serializedValue,
        expiration,
      });
    }
  }

  public async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  public async delete(key: string): Promise<boolean> {
    const result = await DB.table(this.tableName).where('key', key).delete();
    return result > 0;
  }

  public async clear(): Promise<void> {
    await DB.table(this.tableName).delete();
  }

  public async getMany(keys: string[]): Promise<Record<string, any>> {
    const result: Record<string, any> = {};
    for (const key of keys) {
      const val = await this.get(key);
      if (val !== null) {
        result[key] = val;
      }
    }
    return result;
  }

  public async setMany(entries: Record<string, any>, ttlSeconds?: number): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      await this.set(key, value, ttlSeconds);
    }
  }

  public async increment(key: string, value = 1): Promise<number> {
    const current = await this.get<number>(key) || 0;
    const newValue = Number(current) + value;
    await this.set(key, newValue);
    return newValue;
  }

  public async decrement(key: string, value = 1): Promise<number> {
    return this.increment(key, -value);
  }
}
