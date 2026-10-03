/**
 * @file websocket.ts
 * @description Zero-dependency WebSocket upgrade and connection helper for Aero.
 * Implements RFC 6455 WebSocket handshake and lightweight frame messaging using node:crypto.
 */

import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { EventEmitter } from 'node:events';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export interface WebSocketUpgradeHandler {
  (socket: AeroWebSocket, req: IncomingMessage): void | Promise<void>;
}

export interface WebSocketOptions {
  maxPayload?: number;
}

/**
 * Fast, memory-safe unmasking of client frames.
 * Uses 32-bit word-level XOR operations for high throughput and zero allocation overhead.
 */
export function fastUnmask(payload: Buffer, maskKey: Buffer): Buffer {
  const len = payload.length;
  if (len === 0) {
    return Buffer.alloc(0);
  }

  const unmasked = Buffer.allocUnsafe(len);
  const mask32 = maskKey.readInt32LE(0);
  const remainder = len % 4;
  const wordLimit = len - remainder;

  for (let i = 0; i < wordLimit; i += 4) {
    unmasked.writeInt32LE(payload.readInt32LE(i) ^ mask32, i);
  }

  for (let i = wordLimit; i < len; i++) {
    unmasked[i] = payload[i]! ^ maskKey[i % 4]!;
  }

  return unmasked;
}

/**
 * Lightweight Zero-Dependency RFC 6455 WebSocket Connection wrapper over Duplex stream.
 */
export class AeroWebSocket extends EventEmitter {
  public socket: Duplex;
  public isClosed = false;
  public readonly maxPayload: number;
  private buffer: Buffer = Buffer.alloc(0);
  private currentFragments: Buffer[] = [];
  private currentOpcode: number | null = null;

  private onSocketData: (chunk: Buffer) => void;
  private onSocketClose: () => void;
  private onSocketError: (err: Error) => void;
  private onSocketEnd: () => void;

  constructor(socket: Duplex, options: WebSocketOptions = {}) {
    super();
    this.socket = socket;
    this.maxPayload = options.maxPayload ?? 5 * 1024 * 1024; // 5MB default

    this.onSocketData = (chunk: Buffer) => {
      if (this.isClosed) return;
      if (this.buffer.length === 0) {
        this.buffer = chunk;
      } else {
        this.buffer = Buffer.concat([this.buffer, chunk]);
      }
      if (this.buffer.length > this.maxPayload) {
        this.close(1009, 'Payload too large');
        return;
      }
      this.parseFrames();
    };

    this.onSocketClose = () => {
      this.cleanup();
      this.emit('close');
    };

    this.onSocketError = (err: Error) => {
      this.cleanup();
      this.emit('error', err);
    };

    this.onSocketEnd = () => {
      this.cleanup();
      this.emit('close');
    };

    this.socket.on('data', this.onSocketData);
    this.socket.on('close', this.onSocketClose);
    this.socket.on('error', this.onSocketError);
    this.socket.on('end', this.onSocketEnd);
  }

  /**
   * Cleans up internal buffers and removes all socket listeners to prevent memory leaks.
   */
  public cleanup(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    this.buffer = Buffer.alloc(0);
    this.currentFragments = [];
    this.currentOpcode = null;

    if (this.socket) {
      this.socket.removeListener('data', this.onSocketData);
      this.socket.removeListener('close', this.onSocketClose);
      this.socket.removeListener('error', this.onSocketError);
      this.socket.removeListener('end', this.onSocketEnd);
    }
  }

  /**
   * Destroys the connection immediately and frees all resources.
   */
  public destroy(error?: Error): void {
    this.cleanup();
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy(error);
    }
    if (error) {
      this.emit('error', error);
    }
  }

  /**
   * Sends a UTF-8 text message to the WebSocket client.
   */
  public send(data: string | object): void {
    if (this.isClosed) return;
    const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
    const payload = Buffer.from(text, 'utf-8');
    const length = payload.length;

    let header: Buffer;
    if (length <= 125) {
      header = Buffer.from([0x81, length]);
    } else if (length <= 65535) {
      header = Buffer.allocUnsafe(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    this.socket.write(Buffer.concat([header, payload]));
  }

  /**
   * Closes the WebSocket connection gracefully.
   */
  public close(code = 1000, reason = ''): void {
    if (this.isClosed) return;

    try {
      const reasonBuf = Buffer.from(reason, 'utf-8');
      const payload = Buffer.allocUnsafe(2 + reasonBuf.length);
      payload.writeUInt16BE(code, 0);
      reasonBuf.copy(payload, 2);

      const header = Buffer.from([0x88, payload.length]);
      this.socket.write(Buffer.concat([header, payload]));
      this.socket.end();
    } catch {
      // Ignore write errors on closing stream
    } finally {
      this.cleanup();
    }
  }

  /**
   * Internal RFC 6455 frame parser for incoming client messages (which must be masked).
   * Optimized with single buffer slicing and 32-bit word unmasking.
   */
  private parseFrames(): void {
    let offset = 0;

    while (this.buffer.length - offset >= 2) {
      const firstByte = this.buffer[offset]!;
      const secondByte = this.buffer[offset + 1]!;

      const isFin = (firstByte & 0x80) === 0x80;
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) === 0x80;

      // RFC 6455 Section 5.1: Client-to-server frames MUST be masked.
      if (!isMasked) {
        this.close(1002, 'Protocol error: client frame must be masked');
        this.emit('error', new Error('Protocol error: unmasked client frame received'));
        return;
      }

      let payloadLength = secondByte & 0x7f;
      let headerSize = 2;

      if (payloadLength === 126) {
        if (this.buffer.length - offset < 4) break;
        payloadLength = this.buffer.readUInt16BE(offset + 2);
        headerSize = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length - offset < 10) break;
        payloadLength = Number(this.buffer.readBigUInt64BE(offset + 2));
        headerSize = 10;
      }

      if (payloadLength > this.maxPayload) {
        this.close(1009, 'Message payload exceeds limit');
        return;
      }

      const maskLength = 4;
      const totalLength = headerSize + maskLength + payloadLength;

      if (this.buffer.length - offset < totalLength) {
        // Incomplete frame, wait for more data
        break;
      }

      const maskKey = this.buffer.subarray(offset + headerSize, offset + headerSize + 4);
      const payloadData = this.buffer.subarray(offset + headerSize + 4, offset + totalLength);
      const unmaskedPayload = fastUnmask(payloadData, maskKey);

      offset += totalLength;

      // Handle Control Frames (Ping: 0x9, Pong: 0xA, Close: 0x8)
      if (opcode === 0x8) {
        // Close frame
        this.close();
        this.emit('close');
        break;
      } else if (opcode === 0x9) {
        // Ping -> respond with Pong
        const pongHeader = Buffer.from([0x8a, 0x00]);
        this.socket.write(pongHeader);
        this.emit('ping');
        continue;
      } else if (opcode === 0xa) {
        // Pong
        this.emit('pong');
        continue;
      }

      // Handle Data Frames (Text: 0x1, Binary: 0x2, Continuation: 0x0)
      if (opcode === 0x1 || opcode === 0x2) {
        if (!isFin) {
          this.currentOpcode = opcode;
          this.currentFragments = [unmaskedPayload];
        } else {
          if (opcode === 0x1) {
            this.emit('message', unmaskedPayload.toString('utf-8'));
          } else {
            this.emit('message', unmaskedPayload);
          }
        }
      } else if (opcode === 0x0) {
        // Continuation frame
        this.currentFragments.push(unmaskedPayload);
        if (isFin) {
          const fullBuffer = Buffer.concat(this.currentFragments);
          const finalOpcode = this.currentOpcode ?? 0x1;
          this.currentFragments = [];
          this.currentOpcode = null;

          if (finalOpcode === 0x1) {
            this.emit('message', fullBuffer.toString('utf-8'));
          } else {
            this.emit('message', fullBuffer);
          }
        }
      }
    }

    if (offset > 0) {
      if (offset >= this.buffer.length) {
        this.buffer = Buffer.alloc(0);
      } else {
        this.buffer = this.buffer.subarray(offset);
      }
    }
  }
}

/**
 * Handles HTTP upgrade to WebSocket per RFC 6455.
 */
export function handleWebSocketUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
): AeroWebSocket | null {
  const secWebSocketKey = req.headers['sec-websocket-key'];
  const upgradeHeader = req.headers['upgrade'];

  if (
    !upgradeHeader ||
    upgradeHeader.toLowerCase() !== 'websocket' ||
    !secWebSocketKey ||
    typeof secWebSocketKey !== 'string'
  ) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return null;
  }

  const hash = crypto
    .createHash('sha1')
    .update(secWebSocketKey + WS_GUID)
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`,
    '\r\n',
  ];

  socket.write(headers.join('\r\n'));

  const ws = new AeroWebSocket(socket);
  if (head && head.length > 0) {
    socket.emit('data', head);
  }

  return ws;
}
