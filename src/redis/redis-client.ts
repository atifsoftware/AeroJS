/**
 * @file redis-client.ts
 * @description Fluent API providing Redis commands for AeroJS.
 */

import { RedisConnection } from './redis-connection.js';
import type { RedisConnectionOptions } from './redis-connection.js';

export class RedisClient {
  private connection: RedisConnection;

  constructor(options?: RedisConnectionOptions) {
    this.connection = new RedisConnection(options);
  }

  public connect(): Promise<void> {
    return this.connection.connect();
  }

  public disconnect(): Promise<void> {
    return this.connection.disconnect();
  }

  public getRawConnection(): RedisConnection {
    return this.connection;
  }

  // --- Basic Commands ---

  public get(key: string): Promise<string | null> {
    return this.connection.sendCommand(['GET', key]);
  }

  public set(key: string, value: string | number | Buffer): Promise<string> {
    return this.connection.sendCommand(['SET', key, value]);
  }

  public setex(key: string, seconds: number, value: string | number | Buffer): Promise<string> {
    return this.connection.sendCommand(['SETEX', key, seconds, value]);
  }

  public del(...keys: string[]): Promise<number> {
    return this.connection.sendCommand(['DEL', ...keys]);
  }

  public exists(key: string): Promise<number> {
    return this.connection.sendCommand(['EXISTS', key]);
  }

  public expire(key: string, seconds: number): Promise<number> {
    return this.connection.sendCommand(['EXPIRE', key, seconds]);
  }

  public ttl(key: string): Promise<number> {
    return this.connection.sendCommand(['TTL', key]);
  }

  public incr(key: string): Promise<number> {
    return this.connection.sendCommand(['INCR', key]);
  }

  public decr(key: string): Promise<number> {
    return this.connection.sendCommand(['DECR', key]);
  }

  public incrby(key: string, increment: number): Promise<number> {
    return this.connection.sendCommand(['INCRBY', key, increment]);
  }

  public decrby(key: string, decrement: number): Promise<number> {
    return this.connection.sendCommand(['DECRBY', key, decrement]);
  }

  public mget(...keys: string[]): Promise<(string | null)[]> {
    return this.connection.sendCommand(['MGET', ...keys]);
  }

  public mset(data: Record<string, string | number>): Promise<string> {
    const args: (string | number)[] = ['MSET'];
    for (const [key, val] of Object.entries(data)) {
      args.push(key, val);
    }
    return this.connection.sendCommand(args);
  }

  public flushdb(): Promise<string> {
    return this.connection.sendCommand(['FLUSHDB']);
  }

  // --- Hashes ---

  public hset(key: string, field: string, value: string | number): Promise<number> {
    return this.connection.sendCommand(['HSET', key, field, value]);
  }

  public hget(key: string, field: string): Promise<string | null> {
    return this.connection.sendCommand(['HGET', key, field]);
  }

  public hdel(key: string, ...fields: string[]): Promise<number> {
    return this.connection.sendCommand(['HDEL', key, ...fields]);
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    const res: string[] = await this.connection.sendCommand(['HGETALL', key]);
    const obj: Record<string, string> = {};
    for (let i = 0; i < res.length; i += 2) {
      obj[res[i]!] = res[i + 1]!;
    }
    return obj;
  }

  // --- Lists ---

  public lpush(key: string, ...elements: (string | number)[]): Promise<number> {
    return this.connection.sendCommand(['LPUSH', key, ...elements]);
  }

  public rpush(key: string, ...elements: (string | number)[]): Promise<number> {
    return this.connection.sendCommand(['RPUSH', key, ...elements]);
  }

  public lpop(key: string): Promise<string | null> {
    return this.connection.sendCommand(['LPOP', key]);
  }

  public rpop(key: string): Promise<string | null> {
    return this.connection.sendCommand(['RPOP', key]);
  }

  public llen(key: string): Promise<number> {
    return this.connection.sendCommand(['LLEN', key]);
  }

  // --- Sets ---

  public sadd(key: string, ...members: (string | number)[]): Promise<number> {
    return this.connection.sendCommand(['SADD', key, ...members]);
  }

  public srem(key: string, ...members: (string | number)[]): Promise<number> {
    return this.connection.sendCommand(['SREM', key, ...members]);
  }

  public smembers(key: string): Promise<string[]> {
    return this.connection.sendCommand(['SMEMBERS', key]);
  }

  public scard(key: string): Promise<number> {
    return this.connection.sendCommand(['SCARD', key]);
  }

  // --- Pub/Sub ---

  public publish(channel: string, message: string): Promise<number> {
    return this.connection.sendCommand(['PUBLISH', channel, message]);
  }

  public subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    this.connection.on('message', (msg: any) => {
      // msg format for subscribe is typically ['message', channel, payload]
      if (Array.isArray(msg) && msg[0] === 'message' && msg[1] === channel) {
        callback(msg[2]);
      }
    });
    return this.connection.sendCommand(['SUBSCRIBE', channel]);
  }

  public unsubscribe(channel: string): Promise<void> {
    return this.connection.sendCommand(['UNSUBSCRIBE', channel]);
  }
}
