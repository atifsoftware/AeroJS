/**
 * @file broadcaster.ts
 * @description BroadcastAdapters for syncing WebSocket messages across processes or nodes.
 */

import { RedisClient } from '../redis/redis-client.js';

export interface BroadcastAdapter {
  /**
   * Broadcasts an event with data to the specified channels.
   */
  broadcast(channels: string[], event: string, data?: any): Promise<void>;

  /**
   * Subscribes the current node to messages from other nodes.
   */
  subscribe(onMessage: (channel: string, event: string, data: any) => void): Promise<void>;

  /**
   * Unsubscribes and cleans up.
   */
  unsubscribe(): Promise<void>;
}

/**
 * Memory Broadcaster - suitable only for single-node deployments.
 */
export class MemoryBroadcaster implements BroadcastAdapter {
  private listener?: (channel: string, event: string, data: any) => void;

  public async broadcast(channels: string[], event: string, data?: any): Promise<void> {
    if (!this.listener) return;
    for (const channel of channels) {
      // Simulate async nature of network broadcasts
      process.nextTick(() => {
        this.listener?.(channel, event, data);
      });
    }
  }

  public async subscribe(onMessage: (channel: string, event: string, data: any) => void): Promise<void> {
    this.listener = onMessage;
  }

  public async unsubscribe(): Promise<void> {
    this.listener = undefined;
  }
}

/**
 * Redis Broadcaster - suitable for multi-node horizontal scaling.
 */
export class RedisBroadcaster implements BroadcastAdapter {
  private pubClient: RedisClient;
  private subClient: RedisClient;
  private prefix: string;
  private isSubscribed = false;

  constructor(pubClient: RedisClient, subClient: RedisClient, prefix = 'aero:ws:') {
    this.pubClient = pubClient;
    this.subClient = subClient;
    this.prefix = prefix;
  }

  private channelName(ch: string) {
    return `${this.prefix}${ch}`;
  }

  public async broadcast(channels: string[], event: string, data?: any): Promise<void> {
    const payload = JSON.stringify({ event, data });
    const promises = channels.map(ch =>
      this.pubClient.publish(this.channelName(ch), payload)
    );
    await Promise.all(promises);
  }

  public async subscribe(onMessage: (channel: string, event: string, data: any) => void): Promise<void> {
    if (this.isSubscribed) return;

    // PSUBSCRIBE to all channels matching prefix
    const pattern = `${this.prefix}*`;

    const conn = this.subClient.getRawConnection();
    conn.on('message', (msg: any) => {
      // msg for psubscribe is usually ['pmessage', pattern, channel, payload]
      if (Array.isArray(msg) && msg[0] === 'pmessage' && msg[1] === pattern) {
        const fullChannel = msg[2] as string;
        const payloadStr = msg[3] as string;
        const channel = fullChannel.substring(this.prefix.length);
        try {
          const { event, data } = JSON.parse(payloadStr);
          onMessage(channel, event, data);
        } catch {
          // ignore malformed payloads
        }
      }
    });

    await conn.sendCommand(['PSUBSCRIBE', pattern]);
    this.isSubscribed = true;
  }

  public async unsubscribe(): Promise<void> {
    if (!this.isSubscribed) return;
    const pattern = `${this.prefix}*`;
    await this.subClient.getRawConnection().sendCommand(['PUNSUBSCRIBE', pattern]);
    this.isSubscribed = false;
  }
}
