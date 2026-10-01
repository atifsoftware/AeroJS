/**
 * @file memory-cache-driver.ts
 * @description In-memory CacheDriver with LRU eviction and TTL.
 */

import type { CacheDriver } from '../cache-driver.js';

interface CacheEntry {
  value: any;
  expiresAt: number | null;
}

export class MemoryCacheDriver implements CacheDriver {
  private store: Map<string, CacheEntry> = new Map();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  public async get<T = any>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }

    // Refresh LRU
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value as T;
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict oldest (Map iterates in insertion order)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  public async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  public async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  public async clear(): Promise<void> {
    this.store.clear();
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
