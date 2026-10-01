import { describe, it, expect, vi } from 'vitest';
import { WebSocketHub } from '../src/ws/websocket-hub.js';
import { MemoryBroadcaster } from '../src/ws/broadcaster.js';
import { AeroWebSocket } from '../src/ws/websocket.js';
import { EventEmitter } from 'node:events';

class MockSocket extends EventEmitter {
  public isClosed = false;

  // Minimal Duplex mock for AeroWebSocket constructor
  on() {}
  once() {}
  write() {}
  end() {}
}

class MockAeroWebSocket extends EventEmitter {
  public isClosed = false;
  public sentMessages: any[] = [];

  send(data: any) {
    this.sentMessages.push(typeof data === 'string' ? JSON.parse(data) : data);
  }

  // Simulate client sending message
  simulateClientMessage(msg: any) {
    this.emit('message', JSON.stringify(msg));
  }
}

describe('WebSocket Hub and Clustering', () => {
  it('manages client subscriptions and broadcasts locally', async () => {
    const hub = new WebSocketHub(new MemoryBroadcaster());
    const socket1 = new MockAeroWebSocket() as unknown as AeroWebSocket;
    const socket2 = new MockAeroWebSocket() as unknown as AeroWebSocket;

    hub.handleConnection(socket1);
    hub.handleConnection(socket2);

    // Client 1 subscribes to public channel
    (socket1 as unknown as MockAeroWebSocket).simulateClientMessage({
      event: 'pusher:subscribe',
      data: { channel: 'public-news' }
    });

    // Wait for microtasks
    await new Promise(r => setTimeout(r, 0));

    expect((socket1 as unknown as MockAeroWebSocket).sentMessages).toContainEqual({
      event: 'pusher_internal:subscription_succeeded',
      channel: 'public-news'
    });

    // Broadcast
    await hub.broadcast('public-news', 'article.published', { id: 1 });
    await new Promise(r => setTimeout(r, 10)); // Memory broadcaster uses process.nextTick

    // Socket 1 should receive it
    expect((socket1 as unknown as MockAeroWebSocket).sentMessages).toContainEqual({
      event: 'article.published',
      channel: 'public-news',
      data: { id: 1 }
    });

    // Socket 2 shouldn't receive it
    expect((socket2 as unknown as MockAeroWebSocket).sentMessages).not.toContainEqual({
      event: 'article.published',
      channel: 'public-news',
      data: { id: 1 }
    });
  });

  it('handles presence channels and member tracking', async () => {
    const hub = new WebSocketHub(new MemoryBroadcaster());
    hub.channel('presence-room-1', () => true);
    const socket1 = new MockAeroWebSocket() as unknown as AeroWebSocket;
    const user1 = { id: 123, name: 'Alice' };

    hub.handleConnection(socket1, user1);

    (socket1 as unknown as MockAeroWebSocket).simulateClientMessage({
      event: 'pusher:subscribe',
      data: { channel: 'presence-room-1' }
    });

    await new Promise(r => setTimeout(r, 10));

    // It should broadcast member added to the channel
    const msgs = (socket1 as unknown as MockAeroWebSocket).sentMessages;
    expect(msgs).toContainEqual({
      event: 'pusher_internal:member_added',
      channel: 'presence-room-1',
      data: { user: user1 }
    });
  });

  it('handles private channel auth guards', async () => {
    const hub = new WebSocketHub();

    hub.channel('private-user.:id', (user, id) => {
      return user && String(user.id) === String(id);
    });

    // Unauthorized socket (wrong user)
    const socket1 = new MockAeroWebSocket() as unknown as AeroWebSocket;
    hub.handleConnection(socket1, { id: 999 });

    (socket1 as unknown as MockAeroWebSocket).simulateClientMessage({
      event: 'pusher:subscribe',
      data: { channel: 'private-user.123' }
    });

    await new Promise(r => setTimeout(r, 10));

    let msgs = (socket1 as unknown as MockAeroWebSocket).sentMessages;
    expect(msgs).toContainEqual({
      event: 'pusher:subscription_error',
      channel: 'private-user.123',
      data: { message: 'Unauthorized', type: 'AuthError' }
    });

    // Authorized socket
    const socket2 = new MockAeroWebSocket() as unknown as AeroWebSocket;
    hub.handleConnection(socket2, { id: 123 });

    (socket2 as unknown as MockAeroWebSocket).simulateClientMessage({
      event: 'pusher:subscribe',
      data: { channel: 'private-user.123' }
    });

    await new Promise(r => setTimeout(r, 10));

    msgs = (socket2 as unknown as MockAeroWebSocket).sentMessages;
    expect(msgs).toContainEqual({
      event: 'pusher_internal:subscription_succeeded',
      channel: 'private-user.123'
    });
  });
});
