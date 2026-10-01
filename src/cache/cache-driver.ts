/**
 * @file cache-driver.ts
 * @description Defines the CacheDriver contract interface.
 */

export interface CacheDriver {
  /**
   * Retrieve an item from the cache by key.
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * Store an item in the cache for a given number of seconds.
   */
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;

  /**
   * Determine if an item exists in the cache.
   */
  has(key: string): Promise<boolean>;

  /**
   * Remove an item from the cache.
   */
  delete(key: string): Promise<boolean>;

  /**
   * Remove all items from the cache.
   */
  clear(): Promise<void>;

  /**
   * Retrieve multiple items from the cache by key.
   */
  getMany(keys: string[]): Promise<Record<string, any>>;

  /**
   * Store multiple items in the cache for a given number of seconds.
   */
  setMany(entries: Record<string, any>, ttlSeconds?: number): Promise<void>;

  /**
   * Increment the value of an item in the cache.
   */
  increment(key: string, value?: number): Promise<number>;

  /**
   * Decrement the value of an item in the cache.
   */
  decrement(key: string, value?: number): Promise<number>;
}
