/**
 * @file session-driver.ts
 * @description Session Driver interface and base implementations for AeroJS.
 */

export interface SessionDriver {
  read(sessionId: string): Promise<Record<string, unknown>>;
  write(sessionId: string, data: Record<string, unknown>, ttl: number): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  gc(): Promise<void>; // Garbage collect expired sessions
}

/**
 * In-memory session driver (development/testing only).
 * WARNING: All sessions lost on server restart.
 */
export class MemorySessionDriver implements SessionDriver {
  private store = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();

  public async read(sessionId: string): Promise<Record<string, unknown>> {
    const entry = this.store.get(sessionId);
    if (!entry) return {};
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionId);
      return {};
    }
    return { ...entry.data };
  }

  public async write(sessionId: string, data: Record<string, unknown>, ttl: number): Promise<void> {
    this.store.set(sessionId, { data: { ...data }, expiresAt: Date.now() + ttl * 1000 });
  }

  public async destroy(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  public async gc(): Promise<void> {
    const now = Date.now();
    for (const [key, val] of this.store) {
      if (now > val.expiresAt) this.store.delete(key);
    }
  }
}

/**
 * File-based session driver.
 * Suitable for single-server hospital deployments.
 */
export class FileSessionDriver implements SessionDriver {
  private dir: string;

  constructor(dir = './storage/sessions') {
    this.dir = dir;
  }

  private filePath(id: string): string {
    // Sanitize to prevent path traversal
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
    return `${this.dir}/${safe}.json`;
  }

  public async read(sessionId: string): Promise<Record<string, unknown>> {
    try {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(this.filePath(sessionId), 'utf-8');
      const parsed = JSON.parse(raw) as { data: Record<string, unknown>; expiresAt: number };
      if (Date.now() > parsed.expiresAt) {
        await this.destroy(sessionId);
        return {};
      }
      return parsed.data;
    } catch {
      return {};
    }
  }

  public async write(sessionId: string, data: Record<string, unknown>, ttl: number): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(this.dir, { recursive: true });
    const payload = JSON.stringify({ data, expiresAt: Date.now() + ttl * 1000 });
    await writeFile(this.filePath(sessionId), payload, 'utf-8');
  }

  public async destroy(sessionId: string): Promise<void> {
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(this.filePath(sessionId));
    } catch {}
  }

  public async gc(): Promise<void> {
    const { readdir, readFile, unlink } = await import('node:fs/promises');
    try {
      const files = await readdir(this.dir);
      const now = Date.now();
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await readFile(`${this.dir}/${file}`, 'utf-8');
          const parsed = JSON.parse(raw) as { expiresAt: number };
          if (now > parsed.expiresAt) await unlink(`${this.dir}/${file}`);
        } catch {}
      }
    } catch {}
  }
}

/**
 * Redis session driver — recommended for production hospital deployments.
 * Requires ioredis: npm install ioredis
 */
export class RedisSessionDriver implements SessionDriver {
  private client: any; // ioredis instance
  private prefix: string;

  constructor(redisClient: any, prefix = 'sess:') {
    this.client = redisClient;
    this.prefix = prefix;
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  public async read(sessionId: string): Promise<Record<string, unknown>> {
    try {
      const raw = await this.client.get(this.key(sessionId));
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  public async write(sessionId: string, data: Record<string, unknown>, ttl: number): Promise<void> {
    await this.client.setex(this.key(sessionId), ttl, JSON.stringify(data));
  }

  public async destroy(sessionId: string): Promise<void> {
    await this.client.del(this.key(sessionId));
  }

  public async gc(): Promise<void> {
    // Redis TTL handles expiry automatically — no-op
  }
}
