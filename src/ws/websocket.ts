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

/**
 * Lightweight Zero-Dependency RFC 6455 WebSocket Connection wrapper over Duplex stream.
 */
export class AeroWebSocket extends EventEmitter {
  public socket: Duplex;
  public isClosed = false;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(socket: Duplex) {
    super();
    this.socket = socket;

    this.socket.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.parseFrames();
    });

    this.socket.on('close', () => {
      this.isClosed = true;
      this.emit('close');
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });
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
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
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
    this.isClosed = true;

    const reasonBuf = Buffer.from(reason, 'utf-8');
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);

    const header = Buffer.from([0x88, payload.length]);
    this.socket.write(Buffer.concat([header, payload]));
    this.socket.end();
  }

  /**
   * Internal RFC 6455 frame parser for incoming client messages (which must be masked).
   */
  private parseFrames(): void {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0]!;
      const secondByte = this.buffer[1]!;

      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        payloadLength = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLength = isMasked ? 4 : 0;
      const totalLength = offset + maskLength + payloadLength;

      if (this.buffer.length < totalLength) {
        // Incomplete frame, wait for more data
        return;
      }

      let maskKey: Buffer | null = null;
      if (isMasked) {
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const payloadData = this.buffer.subarray(offset, offset + payloadLength);
      const unmaskedPayload = Buffer.alloc(payloadLength);

      if (isMasked && maskKey) {
        for (let i = 0; i < payloadLength; i++) {
          unmaskedPayload[i] = payloadData[i]! ^ maskKey[i % 4]!;
        }
      } else {
        payloadData.copy(unmaskedPayload);
      }

      this.buffer = this.buffer.subarray(totalLength);

      // Handle Opcode
      if (opcode === 0x1) {
        // Text frame
        const text = unmaskedPayload.toString('utf-8');
        this.emit('message', text);
      } else if (opcode === 0x2) {
        // Binary frame
        this.emit('message', unmaskedPayload);
      } else if (opcode === 0x8) {
        // Close frame
        this.close();
        this.emit('close');
        return;
      } else if (opcode === 0x9) {
        // Ping -> respond with Pong
        const pongHeader = Buffer.from([0x8a, 0x00]);
        this.socket.write(pongHeader);
        this.emit('ping');
      } else if (opcode === 0xa) {
        // Pong
        this.emit('pong');
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
