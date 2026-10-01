/**
 * @file redis-manager.ts
 * @description Redis Façade / Manager.
 */

import { RedisClient } from './redis-client.js';
import type { RedisConnectionOptions } from './redis-connection.js';

export class RedisManager {
  private static connections = new Map<string, RedisClient>();
  private static defaultConnectionName = 'default';

  /**
   * Configure multiple Redis connections.
   */
  public static configure(
    connections: Record<string, RedisConnectionOptions>,
    defaultConnection = 'default'
  ) {
    this.defaultConnectionName = defaultConnection;
    for (const [name, config] of Object.entries(connections)) {
      this.connections.set(name, new RedisClient(config));
    }
  }

  /**
   * Add or overwrite a specific connection.
   */
  public static addConnection(name: string, client: RedisClient) {
    this.connections.set(name, client);
  }

  /**
   * Get a RedisClient instance by connection name.
   */
  public static connection(name: string = this.defaultConnectionName): RedisClient {
    let client = this.connections.get(name);
    if (!client) {
      if (name === 'default' && this.connections.size === 0) {
        // Auto-create default local connection if none configured
        client = new RedisClient();
        this.connections.set(name, client);
      } else {
        throw new Error(`Redis connection [${name}] not configured.`);
      }
    }
    return client;
  }

  /**
   * Disconnect all active Redis connections.
   */
  public static async closeAll(): Promise<void> {
    const promises = [];
    for (const client of this.connections.values()) {
      promises.push(client.disconnect());
    }
    await Promise.all(promises);
    this.connections.clear();
  }
}

// Global Façade
export const Redis = new Proxy(RedisManager, {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    // Delegate unhandled properties/methods to the default connection
    const defaultClient = target.connection();
    const value = Reflect.get(defaultClient, prop);
    if (typeof value === 'function') {
      return value.bind(defaultClient);
    }
    return value;
  }
}) as typeof RedisManager & RedisClient;
