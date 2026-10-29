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
  private _port: number;
  public readonly host: string;
  private sockets = new Set<net.Socket>();

  public get port(): number {
    const addr = this.server.address();
    if (addr && typeof addr === 'object') {
      return addr.port;
    }
    return this._port;
  }

  constructor(options: TcpServerOptions) {
    super();
    this._port = options.port;
    this.host = options.host || '127.0.0.1';

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
      if (this.listenerCount('error') > 0) {
        this.emit('error', err);
      }
    });
  }

  public async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const errorHandler = (err: Error) => reject(err);
      this.server.once('error', errorHandler);
      this.server.listen(this._port, this.host, () => {
        this.server.removeListener('error', errorHandler);
        resolve();
      });
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
