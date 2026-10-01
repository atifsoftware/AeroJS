import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheManager, MemoryCacheDriver, FileCacheDriver, DatabaseCacheDriver } from '../src/cache/index.js';
import { DB, Schema } from '../src/database/index.js';

describe('Universal Cache System', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MemoryCacheDriver', () => {
    it('should set and get values within TTL', async () => {
      await cache.set('test_key', 'hello', 10); // 10 seconds
      expect(await cache.get('test_key')).toBe('hello');

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);
      expect(await cache.get('test_key')).toBe('hello');
      expect(await cache.has('test_key')).toBe(true);

      // Advance time by another 6 seconds (total 11s)
      vi.advanceTimersByTime(6000);
      expect(await cache.get('test_key')).toBeNull();
      expect(await cache.has('test_key')).toBe(false);
    });

    it('should support getting and setting many', async () => {
      await cache.setMany({ a: 1, b: 2 });
      const values = await cache.store().getMany(['a', 'b', 'c']);
      expect(values).toEqual({ a: 1, b: 2 });
    });

    it('should increment and decrement values', async () => {
      await cache.set('counter', 10);
      expect(await cache.store().increment('counter', 2)).toBe(12);
      expect(await cache.store().decrement('counter', 5)).toBe(7);
      expect(await cache.get('counter')).toBe(7);
    });
  });

  describe('FileCacheDriver', () => {
    beforeEach(async () => {
      cache.extend('file', new FileCacheDriver('storage/test_cache'));
    });

    afterEach(async () => {
      await cache.store('file').clear();
    });

    it('should write to file system and read back', async () => {
      await cache.store('file').set('file_key', { obj: 'val' }, 10);
      expect(await cache.store('file').get('file_key')).toEqual({ obj: 'val' });

      vi.advanceTimersByTime(11000);
      expect(await cache.store('file').get('file_key')).toBeNull();
    });
  });

  describe('DatabaseCacheDriver', () => {
    beforeEach(async () => {
      await DB.closeAll();
      await DB.beginTransaction('memory');
      await Schema.createTable('aero_cache', (table) => {
        table.string('key', 255);
        table.columns.find(c => c.name === 'key')!.isPrimary = true;
        table.text('value');
        table.integer('expiration').nullable();
      });
      cache.extend('database', new DatabaseCacheDriver());
    });

    it('should set and get values using DB query builder', async () => {
      await cache.store('database').set('db_key', 'db_val', 10);
      expect(await cache.store('database').get('db_key')).toBe('db_val');

      const raw = await DB.table('aero_cache').where('key', 'db_key').first();
      expect(raw).toBeDefined();
      expect(raw?.value).toBe('"db_val"');

      vi.advanceTimersByTime(11000);
      expect(await cache.store('database').get('db_key')).toBeNull();
    });
  });

  describe('Cache Manager Façade', () => {
    it('remember should compute only once on cache miss', async () => {
      const cb = vi.fn().mockResolvedValue('computed_val');

      const p1 = cache.remember('rem_key', 10, cb);
      const p2 = cache.remember('rem_key', 10, cb);
      const p3 = cache.remember('rem_key', 10, cb);

      const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

      expect(res1).toBe('computed_val');
      expect(res2).toBe('computed_val');
      expect(res3).toBe('computed_val');
      expect(cb).toHaveBeenCalledTimes(1);

      // Next call should just hit cache
      const res4 = await cache.remember('rem_key', 10, cb);
      expect(res4).toBe('computed_val');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('tags should invalidate namespaced keys', async () => {
      await cache.tags(['user:1']).set('profile', 'admin');

      const val1 = await cache.get('tag:user:1:1:profile');
      expect(val1).toBe('admin');

      // Flush tag increments version
      await cache.tags(['user:1']).flush();

      // Using the tags facade to set a new one
      await cache.tags(['user:1']).set('profile', 'guest');

      const val2 = await cache.get('tag:user:1:2:profile');
      expect(val2).toBe('guest');
    });

    it('lock should prevent concurrent execution', async () => {
      let executions = 0;
      const criticalSection = async () => {
        executions++;
        // Simulate some async work using fake timers logic
        return 'done';
      };

      const lock1 = cache.lock('process_item', 10);
      const lock2 = cache.lock('process_item', 10);

      // Start lock 1 and don't await immediately to simulate concurrency
      const p1 = lock1.get(async () => {
        executions++;
        // Hold the lock for a bit in simulation time
        return 'done';
      });

      // Try lock 2 immediately before lock 1 releases
      const res2 = await lock2.get(criticalSection);
      const res1 = await p1;

      expect(res1).toBe('done');
      expect(res2).toBeNull();
      expect(executions).toBe(1);
    });
  });
});
