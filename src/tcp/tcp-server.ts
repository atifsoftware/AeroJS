/**
 * @file tcp-server.ts
 * @description Raw TCP Gateway for AeroJS. Enables low-latency hardware integration (analyzers, IoT, POS).
 */

import net from 'node:net';
import { EventEmitter } from 'node:events';

export interface TcpServerOptions {
  port: number;
  host?: string;
}

export class TcpServer extends EventEmitter {
  private server: net.Server;
  public readonly port: number;
  public readonly host: string;
  private sockets = new Set<net.Socket>();

  constructor(options: TcpServerOptions) {
    super();
    this.port = options.port;
    this.host = options.host || '0.0.0.0';

    this.server = net.createServer((socket) => {
      this.sockets.add(socket);
      this.emit('connection', socket);

      socket.on('data', (buffer) => {
        this.emit('data', socket, buffer);
      });

      socket.on('error', (err) => {
        this.emit('clientError', err, socket);
      });

      socket.on('close', () => {
        this.sockets.delete(socket);
        this.emit('close', socket);
      });
    });

    this.server.on('error', (err) => {
      this.emit('error', err);
    });
  }

  public async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, () => {
        resolve();
      });
      this.server.once('error', reject);
    });
  }

  public broadcast(data: string | Buffer): void {
    for (const socket of this.sockets) {
      if (!socket.destroyed) {
        socket.write(data);
      }
    }
  }

  public async close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
