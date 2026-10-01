/**
 * @file cache-manager.ts
 * @description Manages cache drivers and provides high-level cache operations.
 */

import type { CacheDriver } from './cache-driver.js';
import { MemoryCacheDriver } from './drivers/memory-cache-driver.js';
import crypto from 'node:crypto';

export class CacheManager {
  private drivers: Map<string, CacheDriver> = new Map();
  private defaultDriverName = 'memory';

  constructor() {
    this.drivers.set('memory', new MemoryCacheDriver());
  }

  public extend(name: string, driver: CacheDriver): void {
    this.drivers.set(name, driver);
  }

  public store(name?: string): CacheDriver {
    const target = name || this.defaultDriverName;
    const driver = this.drivers.get(target);
    if (!driver) {
      throw new Error(`Cache driver [${target}] is not configured.`);
    }
    return driver;
  }

  public async get<T = any>(key: string): Promise<T | null> {
    return this.store().get<T>(key);
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    return this.store().set(key, value, ttlSeconds);
  }

  public async has(key: string): Promise<boolean> {
    return this.store().has(key);
  }

  public async delete(key: string): Promise<boolean> {
    return this.store().delete(key);
  }

  public async clear(): Promise<void> {
    return this.store().clear();
  }

  public async getMany(keys: string[]): Promise<Record<string, any>> {
    return this.store().getMany(keys);
  }

  public async setMany(entries: Record<string, any>, ttlSeconds?: number): Promise<void> {
    return this.store().setMany(entries, ttlSeconds);
  }

  public async increment(key: string, value?: number): Promise<number> {
    return this.store().increment(key, value);
  }

  public async decrement(key: string, value?: number): Promise<number> {
    return this.store().decrement(key, value);
  }

  private inflightPromises: Map<string, Promise<any>> = new Map();

  /**
   * Remember an item in the cache, computing it if missing. Prevent race conditions by holding a single Promise.
   */
  public async remember<T>(key: string, ttlSeconds: number, callback: () => Promise<T>): Promise<T> {
    const existing = await this.get<T>(key);
    if (existing !== null) {
      return existing;
    }

    if (this.inflightPromises.has(key)) {
      return this.inflightPromises.get(key) as Promise<T>;
    }

    const promise = (async () => {
      try {
        const value = await callback();
        await this.set(key, value, ttlSeconds);
        return value;
      } finally {
        this.inflightPromises.delete(key);
      }
    })();

    this.inflightPromises.set(key, promise);
    return promise;
  }

  /**
   * Tagged cache. Implemented via namespacing.
   */
  public tags(names: string[]) {
    const getTagKeys = async () => {
      const keys = [];
      for (const name of names) {
        let tagVersion = await this.get<number>(`tag:${name}:version`);
        if (!tagVersion) {
          tagVersion = 1;
          await this.set(`tag:${name}:version`, tagVersion);
        }
        keys.push(`tag:${name}:${tagVersion}`);
      }
      return keys.join('|') + ':';
    };

    return {
      set: async (key: string, value: any, ttlSeconds?: number) => {
        const prefix = await getTagKeys();
        await this.set(prefix + key, value, ttlSeconds);
      },
      get: async <T = any>(key: string): Promise<T | null> => {
        const prefix = await getTagKeys();
        return this.get<T>(prefix + key);
      },
      has: async (key: string): Promise<boolean> => {
        const prefix = await getTagKeys();
        return this.has(prefix + key);
      },
      remember: async <T>(key: string, ttlSeconds: number, callback: () => Promise<T>): Promise<T> => {
        const prefix = await getTagKeys();
        return this.remember(prefix + key, ttlSeconds, callback);
      },
      flush: async () => {
        for (const name of names) {
          await this.increment(`tag:${name}:version`);
        }
      }
    };
  }

  /**
   * Atomic execution lock.
   */
  public lock(name: string, seconds: number) {
    return {
      get: async <T>(callback: () => Promise<T | void>): Promise<T | null> => {
        const lockKey = `lock:${name}`;

        // Using inflightPromises to hold the local lock token synchronously
        if (this.inflightPromises.has(lockKey)) return null;

        // Reserve the local lock immediately
        let resolveLock: () => void;
        const lockToken = new Promise<void>(res => { resolveLock = res; });
        this.inflightPromises.set(lockKey, lockToken);

        let acquired = false;
        // Use a unique token so we can verify we acquired the lock in distributed setups
        const uniqueToken = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        try {
          // Check remote lock
          const hasLock = await this.has(lockKey);
          if (hasLock) return null; // Lock is currently held

          await this.set(lockKey, uniqueToken, seconds);

          // Double check to narrow race condition window for distributed contexts
          const verifyLock = await this.get(lockKey);
          if (verifyLock !== uniqueToken) return null;

          acquired = true;
          const res = await callback();
          return res as T;
        } finally {
          if (acquired) {
            await this.delete(lockKey);
          }
          resolveLock!();
          this.inflightPromises.delete(lockKey);
        }
      }
    };
  }
}

// Global static façade instance
export const Cache = new CacheManager();
