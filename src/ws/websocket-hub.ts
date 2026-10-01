/**
 * @file websocket-hub.ts
 * @description Central manager for WebSocket clients, channels, and broadcasting.
 */

import { AeroWebSocket } from './websocket.js';
import { MemoryBroadcaster } from './broadcaster.js';
import type { BroadcastAdapter } from './broadcaster.js';
import * as crypto from 'node:crypto';

export type AuthGuard = (socket: AeroWebSocket, req: any) => Promise<boolean | any>;
export type ChannelAuthCallback = (user: any, ...args: string[]) => boolean | any | Promise<boolean | any>;

export interface ConnectionInfo {
  socket: AeroWebSocket;
  id: string;
  channels: Set<string>;
  user: any | null; // Populated by auth middleware/guard
}

export class WebSocketHub {
  private connections = new Map<string, ConnectionInfo>();
  private channelSubscribers = new Map<string, Set<string>>(); // channelName -> Set<connectionId>

  // Custom auth guards for private/presence channels
  private channelGuards = new Map<string, ChannelAuthCallback>();
  private broadcaster: BroadcastAdapter;

  constructor(broadcaster?: BroadcastAdapter) {
    this.broadcaster = broadcaster || new MemoryBroadcaster();
    this.setupBroadcaster();
  }

  private async setupBroadcaster() {
    await this.broadcaster.subscribe((channel, event, data) => {
      this.transmitToLocalSubscribers(channel, event, data);
    });
  }

  /**
   * Set the broadcaster implementation (e.g. Memory to Redis)
   */
  public setBroadcaster(broadcaster: BroadcastAdapter) {
    this.broadcaster.unsubscribe().catch(() => {});
    this.broadcaster = broadcaster;
    this.setupBroadcaster();
  }

  /**
   * Register a dynamic authorization callback for a channel pattern (e.g., 'orders.:id')
   */
  public channel(name: string, callback: ChannelAuthCallback) {
    this.channelGuards.set(name, callback);
  }

  /**
   * Called by the server when a new websocket upgrades successfully.
   */
  public handleConnection(socket: AeroWebSocket, user: any = null) {
    const connId = crypto.randomUUID();
    const info: ConnectionInfo = { socket, id: connId, channels: new Set(), user };
    this.connections.set(connId, info);

    socket.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await this.handleClientMessage(info, msg);
      } catch (err) {
        // invalid message format
      }
    });

    socket.on('close', () => {
      this.removeConnection(connId);
    });
  }

  /**
   * Sends an event to all connected clients locally and across other nodes via Broadcaster.
   */
  public async broadcast(channels: string | string[], event: string, data?: any) {
    const chs = Array.isArray(channels) ? channels : [channels];
    await this.broadcaster.broadcast(chs, event, data);
  }

  /**
   * Transmits a message received from the Broadcaster to local sockets subscribed to the channel.
   */
  private transmitToLocalSubscribers(channel: string, event: string, data: any) {
    const subs = this.channelSubscribers.get(channel);
    if (!subs) return;

    const payload = JSON.stringify({ event, channel, data });
    for (const connId of subs) {
      const conn = this.connections.get(connId);
      if (conn && !conn.socket.isClosed) {
        conn.socket.send(payload);
      }
    }
  }

  /**
   * Handles pusher/echo style client messages.
   * Format: { event: 'pusher:subscribe', data: { channel: '...' } }
   */
  private async handleClientMessage(conn: ConnectionInfo, msg: any) {
    if (!msg || typeof msg.event !== 'string') return;

    if (msg.event === 'pusher:ping') {
      conn.socket.send({ event: 'pusher:pong' });
      return;
    }

    if (msg.event === 'pusher:subscribe' && msg.data?.channel) {
      const channel = msg.data.channel;
      const isPrivate = channel.startsWith('private-');
      const isPresence = channel.startsWith('presence-');

      if (isPrivate || isPresence) {
        const authOk = await this.authorizeSubscription(conn, channel);
        if (!authOk) {
          // Send unauthorized or ignore? Usually send an error event
          conn.socket.send({
            event: 'pusher:subscription_error',
            channel,
            data: { message: 'Unauthorized', type: 'AuthError' }
          });
          return;
        }
      }

      this.subscribeClient(conn, channel);
      conn.socket.send({ event: 'pusher_internal:subscription_succeeded', channel });

      if (isPresence) {
        // Broadcast member added
        await this.broadcast(channel, 'pusher_internal:member_added', { user: conn.user });
      }
    }

    if (msg.event === 'pusher:unsubscribe' && msg.data?.channel) {
      this.unsubscribeClient(conn, msg.data.channel);
    }

    // Client-to-client events (whisper)
    if (msg.event.startsWith('client-') && msg.channel) {
       // Must be subscribed to the channel to whisper (and it must be private/presence)
       if (conn.channels.has(msg.channel) && (msg.channel.startsWith('private-') || msg.channel.startsWith('presence-'))) {
           // We broadcast it out, excluding sender locally if we could,
           // but the standard broadcast goes to everyone. Echo handles filtering sender.
           await this.broadcast(msg.channel, msg.event, msg.data);
       }
    }
  }

  private subscribeClient(conn: ConnectionInfo, channel: string) {
    conn.channels.add(channel);
    if (!this.channelSubscribers.has(channel)) {
      this.channelSubscribers.set(channel, new Set());
    }
    this.channelSubscribers.get(channel)!.add(conn.id);
  }

  private unsubscribeClient(conn: ConnectionInfo, channel: string) {
    conn.channels.delete(channel);
    const subs = this.channelSubscribers.get(channel);
    if (subs) {
      subs.delete(conn.id);
      if (subs.size === 0) {
        this.channelSubscribers.delete(channel);
      }
    }
  }

  private removeConnection(connId: string) {
    const conn = this.connections.get(connId);
    if (!conn) return;

    for (const channel of conn.channels) {
      this.unsubscribeClient(conn, channel);
      if (channel.startsWith('presence-')) {
        void this.broadcast(channel, 'pusher_internal:member_removed', { user: conn.user });
      }
    }
    this.connections.delete(connId);
  }

  private async authorizeSubscription(conn: ConnectionInfo, channelName: string): Promise<boolean> {
    if (!conn.user) return false;

    // Exact match
    if (this.channelGuards.has(channelName)) {
      const guard = this.channelGuards.get(channelName)!;
      try {
        const res = await guard(conn.user);
        return !!res;
      } catch {
        return false;
      }
    }

    // Pattern match (e.g., private-user.:id)
    for (const [pattern, guard] of this.channelGuards.entries()) {
      const regex = new RegExp('^' + pattern.replace(/:[^\s/]+/g, '([\\w-]+)') + '$');
      const match = channelName.match(regex);
      if (match) {
        const args = match.slice(1);
        try {
          const res = await guard(conn.user, ...args);
          return !!res;
        } catch {
          return false;
        }
      }
    }

    return false; // No matching guard, default deny for private/presence
  }
}
