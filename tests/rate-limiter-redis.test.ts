import { describe, it, expect, beforeEach } from 'vitest';
import { RedisRateLimitStore, rateLimit } from '../src/security/index.js';
import { AeroContext } from '../src/core/context.js';

class MockRedisClient {
  public store = new Map<string, { value: number; expireAt?: number }>();
  public calls: string[] = [];

  public async incr(key: string): Promise<number> {
    this.calls.push(`INCR ${key}`);
    const entry = this.store.get(key) || { value: 0 };
    entry.value += 1;
    this.store.set(key, entry);
    return entry.value;
  }

  public async decr(key: string): Promise<number> {
    this.calls.push(`DECR ${key}`);
    const entry = this.store.get(key) || { value: 0 };
    entry.value = Math.max(0, entry.value - 1);
    this.store.set(key, entry);
    return entry.value;
  }

  public async ttl(key: string): Promise<number> {
    this.calls.push(`TTL ${key}`);
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expireAt) return -1;
    const remainingMs = entry.expireAt - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  public async expire(key: string, seconds: number): Promise<number> {
    this.calls.push(`EXPIRE ${key} ${seconds}`);
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expireAt = Date.now() + seconds * 1000;
    return 1;
  }

  public async del(...keys: string[]): Promise<number> {
    this.calls.push(`DEL ${keys.join(' ')}`);
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  public getRawConnection() {
    return {
      sendCommand: async (args: (string | number)[]) => {
        const cmd = String(args[0]).toUpperCase();
        if (cmd === 'KEYS') {
          const pattern = String(args[1]);
          const prefix = pattern.replace('*', '');
          const matched = Array.from(this.store.keys()).filter((k) => k.startsWith(prefix));
          return matched;
        }
        return null;
      },
    };
  }
}

describe('RedisRateLimitStore', () => {
  let mockRedis: MockRedisClient;
  let store: RedisRateLimitStore;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
    store = new RedisRateLimitStore({
      client: mockRedis,
      prefix: 'test_rl:',
    });
  });

  it('increments hits atomically and sets expiry if not present', async () => {
    const res1 = await store.increment('user_101', 60_000);
    expect(res1.totalHits).toBe(1);
    expect(res1.resetTime).toBeGreaterThan(Date.now());

    expect(mockRedis.calls).toContain('INCR test_rl:user_101');
    expect(mockRedis.calls).toContain('TTL test_rl:user_101');
    expect(mockRedis.calls).toContain('EXPIRE test_rl:user_101 60');

    const res2 = await store.increment('user_101', 60_000);
    expect(res2.totalHits).toBe(2);
  });

  it('decrements and resets single key in Redis', async () => {
    await store.increment('user_202', 60_000);
    await store.increment('user_202', 60_000);

    await store.decrement('user_202');
    expect(mockRedis.calls).toContain('DECR test_rl:user_202');

    await store.resetKey('user_202');
    expect(mockRedis.calls).toContain('DEL test_rl:user_202');
    expect(mockRedis.store.has('test_rl:user_202')).toBe(false);
  });

  it('resets all keys matching prefix', async () => {
    await store.increment('ip_1', 60_000);
    await store.increment('ip_2', 60_000);

    expect(mockRedis.store.size).toBe(2);

    await store.resetAll();
    expect(mockRedis.store.size).toBe(0);
  });

  it('falls back to memory store if Redis throws error when fallbackToMemory is enabled', async () => {
    const failingRedis = {
      incr: async () => {
        throw new Error('Redis connection timed out');
      },
    };

    const resilientStore = new RedisRateLimitStore({
      client: failingRedis,
      fallbackToMemory: true,
    });

    const res = await resilientStore.increment('emergency_ip', 30_000);
    expect(res.totalHits).toBe(1);
  });

  it('integrates seamlessly with Aero rateLimit middleware', async () => {
    const middleware = rateLimit({
      max: 2,
      windowMs: 60_000,
      store,
      keyGenerator: (ctx) => 'api_key_test',
    });

    const createMockCtx = () => {
      const headers: Record<string, string> = {};
      let statusCode = 200;
      let bodyData: any = null;

      return {
        req: { ip: '1.2.3.4' },
        res: {
          setHeader: (name: string, val: string) => {
            headers[name] = val;
          },
          status: (code: number) => {
            statusCode = code;
          },
          json: (data: any) => {
            bodyData = data;
          },
        },
        headers,
        getStatusCode: () => statusCode,
        getBody: () => bodyData,
      } as any;
    };

    let nextCalled = 0;
    const next = async () => {
      nextCalled++;
    };

    // 1st request
    const ctx1 = createMockCtx();
    await middleware(ctx1, next);
    expect(nextCalled).toBe(1);
    expect(ctx1.headers['X-RateLimit-Remaining']).toBe('1');

    // 2nd request
    const ctx2 = createMockCtx();
    await middleware(ctx2, next);
    expect(nextCalled).toBe(2);
    expect(ctx2.headers['X-RateLimit-Remaining']).toBe('0');

    // 3rd request -> Blocked with 429
    const ctx3 = createMockCtx();
    await middleware(ctx3, next);
    expect(nextCalled).toBe(2); // next NOT called
    expect(ctx3.getStatusCode()).toBe(429);
    expect(ctx3.headers['Retry-After']).toBeDefined();
    expect(ctx3.getBody().error.statusCode).toBe(429);
  });
});
