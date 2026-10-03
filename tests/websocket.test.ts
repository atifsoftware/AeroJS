import { describe, it, expect, vi } from 'vitest';
import { Duplex } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import {
  AeroWebSocket,
  handleWebSocketUpgrade,
  fastUnmask,
} from '../src/ws/websocket.js';
import { Aero } from '../src/core/application.js';

class MockDuplex extends Duplex {
  public written: Buffer[] = [];
  public isDestroyed = false;

  public override _write(
    chunk: any,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    callback();
  }

  public override _read(): void {}

  public override destroy(error?: Error): this {
    this.isDestroyed = true;
    return super.destroy(error);
  }
}

describe('Zero-Dependency WebSocket Module', () => {
  it('rejects invalid upgrade requests with 400 Bad Request', () => {
    const socket = new MockDuplex();
    const req = {
      headers: {
        upgrade: 'unknown',
      },
    } as unknown as IncomingMessage;

    const ws = handleWebSocketUpgrade(req, socket, Buffer.alloc(0));
    expect(ws).toBeNull();
    const writtenStr = Buffer.concat(socket.written).toString('utf-8');
    expect(writtenStr).toContain('400 Bad Request');
    expect(socket.isDestroyed).toBe(true);
  });

  it('performs RFC 6455 handshake successfully', () => {
    const socket = new MockDuplex();
    const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
    const req = {
      headers: {
        upgrade: 'websocket',
        'sec-websocket-key': clientKey,
      },
    } as unknown as IncomingMessage;

    const ws = handleWebSocketUpgrade(req, socket, Buffer.alloc(0));
    expect(ws).not.toBeNull();
    expect(ws).toBeInstanceOf(AeroWebSocket);

    const writtenStr = Buffer.concat(socket.written).toString('utf-8');
    expect(writtenStr).toContain('101 Switching Protocols');
    expect(writtenStr).toContain('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });

  it('sends UTF-8 text message to client formatted as RFC 6455 unmasked frame', () => {
    const socket = new MockDuplex();
    const ws = new AeroWebSocket(socket);

    ws.send('Hello WebSocket');
    const written = Buffer.concat(socket.written);

    expect(written[0]).toBe(0x81); // Text frame, FIN
    expect(written[1]).toBe(15); // Length of "Hello WebSocket"
    expect(written.subarray(2).toString('utf-8')).toBe('Hello WebSocket');
  });

  it('sends JSON object as text message', () => {
    const socket = new MockDuplex();
    const ws = new AeroWebSocket(socket);

    ws.send({ event: 'ping' });
    const written = Buffer.concat(socket.written);

    expect(written[0]).toBe(0x81);
    expect(written.subarray(2).toString('utf-8')).toBe('{"event":"ping"}');
  });

  it('parses masked client text frame and emits message event', async () => {
    const socket = new MockDuplex();
    const ws = new AeroWebSocket(socket);

    const messagePromise = new Promise<string>((resolve) => {
      ws.on('message', (msg) => resolve(msg));
    });

    // Construct a client masked frame:
    // "Hi" -> bytes [0x48, 0x69]
    // Mask key: [0x12, 0x34, 0x56, 0x78]
    // Masked bytes: [0x48 ^ 0x12, 0x69 ^ 0x34] = [0x5a, 0x5d]
    const frame = Buffer.from([
      0x81, // FIN + Text opcode (1)
      0x82, // Masked (0x80) + Length 2 (0x02)
      0x12, 0x34, 0x56, 0x78, // Mask key
      0x5a, 0x5d, // Masked payload
    ]);

    socket.emit('data', frame);

    const message = await messagePromise;
    expect(message).toBe('Hi');
  });

  it('handles client ping frame and responds with pong', async () => {
    const socket = new MockDuplex();
    const ws = new AeroWebSocket(socket);

    const pingPromise = new Promise<void>((resolve) => {
      ws.on('ping', () => resolve());
    });

    // Client Ping frame: 0x89 0x80 (masked, length 0) + 4 bytes mask
    const pingFrame = Buffer.from([0x89, 0x80, 0x00, 0x00, 0x00, 0x00]);
    socket.emit('data', pingFrame);

    await pingPromise;

    const written = Buffer.concat(socket.written);
    expect(written[0]).toBe(0x8a); // Pong opcode
    expect(written[1]).toBe(0x00);
  });

  it('gracefully closes the connection with code and reason', () => {
    const socket = new MockDuplex();
    const ws = new AeroWebSocket(socket);

    ws.close(1000, 'Bye');
    expect(ws.isClosed).toBe(true);

    const written = Buffer.concat(socket.written);
    expect(written[0]).toBe(0x88); // Close opcode
    expect(written.readUInt16BE(2)).toBe(1000);
    expect(written.subarray(4).toString('utf-8')).toBe('Bye');
  });

  it('rejects unmasked client frame per RFC 6455 section 5.1 with protocol error 1002', () => {
    const socket = new MockDuplex();
    const ws = new AeroWebSocket(socket);

    let errorEmitted = false;
    ws.on('error', (err) => {
      errorEmitted = true;
      expect(err.message).toContain('unmasked client frame');
    });

    // Unmasked Text frame: 0x81, length 2 (0x02, mask bit not set)
    const unmaskedFrame = Buffer.from([0x81, 0x02, 0x48, 0x69]);
    socket.emit('data', unmaskedFrame);

    expect(ws.isClosed).toBe(true);
    expect(errorEmitted).toBe(true);
    const written = Buffer.concat(socket.written);
    expect(written[0]).toBe(0x88); // Close opcode
    expect(written.readUInt16BE(2)).toBe(1002);
  });

  it('assembles fragmented message using continuation frames (opcode 0x0)', async () => {
    const socket = new MockDuplex();
    const ws = new AeroWebSocket(socket);

    const messagePromise = new Promise<string>((resolve) => {
      ws.on('message', (msg) => resolve(msg));
    });

    // Frame 1: Text opcode (0x1), FIN=0 (0x01), Masked (0x80), Length 2 ('He')
    // Mask key: [0x11, 0x22, 0x33, 0x44]
    // Payload 'He' = [0x48 ^ 0x11, 0x65 ^ 0x22] = [0x59, 0x47]
    const frame1 = Buffer.from([0x01, 0x82, 0x11, 0x22, 0x33, 0x44, 0x59, 0x47]);

    // Frame 2: Continuation opcode (0x0), FIN=1 (0x80), Masked (0x80), Length 3 ('llo')
    // Mask key: [0x11, 0x22, 0x33, 0x44]
    // Payload 'llo' = [0x6c ^ 0x11, 0x6c ^ 0x22, 0x6f ^ 0x33] = [0x7d, 0x4e, 0x5c]
    const frame2 = Buffer.from([0x80, 0x83, 0x11, 0x22, 0x33, 0x44, 0x7d, 0x4e, 0x5c]);

    socket.emit('data', frame1);
    socket.emit('data', frame2);

    const message = await messagePromise;
    expect(message).toBe('Hello');
  });

  describe('WebSocket Frame Processing & Buffer Optimization', () => {
    it('fastUnmask correctly unmasks empty, small, and large payloads', () => {
      const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);

      // Empty payload
      expect(fastUnmask(Buffer.alloc(0), maskKey)).toEqual(Buffer.alloc(0));

      // Small payload
      const text = 'Hello AeroJS WebSocket!';
      const orig = Buffer.from(text, 'utf-8');
      const masked = Buffer.allocUnsafe(orig.length);
      for (let i = 0; i < orig.length; i++) {
        masked[i] = orig[i]! ^ maskKey[i % 4]!;
      }

      const unmasked = fastUnmask(masked, maskKey);
      expect(unmasked.toString('utf-8')).toBe(text);

      // Large payload (64 KB)
      const largeSize = 64 * 1024 + 3; // Test with remainder != 0
      const largeOrig = Buffer.alloc(largeSize);
      for (let i = 0; i < largeSize; i++) {
        largeOrig[i] = (i * 31 + 7) & 0xff;
      }
      const largeMasked = Buffer.allocUnsafe(largeSize);
      for (let i = 0; i < largeSize; i++) {
        largeMasked[i] = largeOrig[i]! ^ maskKey[i % 4]!;
      }

      const largeUnmasked = fastUnmask(largeMasked, maskKey);
      expect(largeUnmasked.equals(largeOrig)).toBe(true);
    });

    it('processes multiple frames concatenated in a single TCP chunk without fragmentation', async () => {
      const socket = new MockDuplex();
      const ws = new AeroWebSocket(socket);

      const received: string[] = [];
      ws.on('message', (msg) => {
        received.push(String(msg));
      });

      // Frame A: "One" (3 bytes)
      const maskA = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);
      const payloadA = Buffer.from('One', 'utf-8');
      const maskedA = Buffer.from([
        payloadA[0]! ^ maskA[0]!,
        payloadA[1]! ^ maskA[1]!,
        payloadA[2]! ^ maskA[2]!,
      ]);
      const frameA = Buffer.concat([Buffer.from([0x81, 0x83]), maskA, maskedA]);

      // Frame B: "Two" (3 bytes)
      const maskB = Buffer.from([0x11, 0x22, 0x33, 0x44]);
      const payloadB = Buffer.from('Two', 'utf-8');
      const maskedB = Buffer.from([
        payloadB[0]! ^ maskB[0]!,
        payloadB[1]! ^ maskB[1]!,
        payloadB[2]! ^ maskB[2]!,
      ]);
      const frameB = Buffer.concat([Buffer.from([0x81, 0x83]), maskB, maskedB]);

      // Deliver both frames in a single 'data' event
      socket.emit('data', Buffer.concat([frameA, frameB]));

      expect(received).toEqual(['One', 'Two']);
    });

    it('cleans up socket event listeners and buffers on socket close event', () => {
      const socket = new MockDuplex();
      const ws = new AeroWebSocket(socket);

      // Verify listeners attached
      expect(socket.listenerCount('data')).toBe(1);
      expect(socket.listenerCount('close')).toBe(1);
      expect(socket.listenerCount('error')).toBe(1);
      expect(socket.listenerCount('end')).toBe(1);

      let closeEmitted = false;
      ws.on('close', () => {
        closeEmitted = true;
      });

      // Simulate socket drop / close
      socket.emit('close');

      expect(ws.isClosed).toBe(true);
      expect(closeEmitted).toBe(true);

      // Verify listeners removed to prevent memory leaks
      expect(socket.listenerCount('data')).toBe(0);
      expect(socket.listenerCount('close')).toBe(0);
      expect(socket.listenerCount('error')).toBe(0);
      expect(socket.listenerCount('end')).toBe(0);
    });

    it('cleans up socket event listeners on socket error event', () => {
      const socket = new MockDuplex();
      const ws = new AeroWebSocket(socket);

      let errorReceived: Error | null = null;
      ws.on('error', (err) => {
        errorReceived = err;
      });

      // Simulate socket drop / network error
      const testErr = new Error('ECONNRESET');
      socket.emit('error', testErr);

      expect(ws.isClosed).toBe(true);
      expect(errorReceived).toBe(testErr);

      // All socket listeners must be cleaned up
      expect(socket.listenerCount('data')).toBe(0);
      expect(socket.listenerCount('close')).toBe(0);
      expect(socket.listenerCount('error')).toBe(0);
      expect(socket.listenerCount('end')).toBe(0);
    });

    it('cleans up socket event listeners when destroy() is called', () => {
      const socket = new MockDuplex();
      const ws = new AeroWebSocket(socket);

      ws.destroy();

      expect(ws.isClosed).toBe(true);
      expect(socket.isDestroyed).toBe(true);
      expect(socket.listenerCount('data')).toBe(0);
      expect(socket.listenerCount('close')).toBe(0);
    });
  });
});

