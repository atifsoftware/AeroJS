/**
 * @file file-cache-driver.ts
 * @description File system backed CacheDriver storing cache in JSON files.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { CacheDriver } from '../cache-driver.js';

interface FileCacheEntry {
  value: any;
  expiresAt: number | null;
}

export class FileCacheDriver implements CacheDriver {
  private cacheDir: string;

  constructor(cacheDir = 'storage/cache') {
    this.cacheDir = path.resolve(process.cwd(), cacheDir);
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.access(this.cacheDir);
    } catch {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }
  }

  private getFilePath(key: string): string {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  public async get<T = any>(key: string): Promise<T | null> {
    try {
      const filePath = this.getFilePath(key);
      const data = await fs.readFile(filePath, 'utf-8');
      const entry: FileCacheEntry = JSON.parse(data);

      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        await this.delete(key);
        return null;
      }

      return entry.value as T;
    } catch {
      return null;
    }
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(key);
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    const entry: FileCacheEntry = { value, expiresAt };
    await fs.writeFile(filePath, JSON.stringify(entry), 'utf-8');
  }

  public async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  public async delete(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  public async clear(): Promise<void> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)).catch(() => {}))
      );
    } catch {
      // Ignore
    }
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
