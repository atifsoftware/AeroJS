/**
 * @file redis-connection.ts
 * @description TCP connection manager for Redis with auto-reconnect and pipeline buffering.
 */

import * as net from 'node:net';
import { EventEmitter } from 'node:events';
import { RESP, RESPError } from './resp-parser.js';

export interface RedisConnectionOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  retryStrategy?: (times: number) => number | null;
}

interface CommandTask {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  commandBuffer: Buffer;
}

export class RedisConnection extends EventEmitter {
  private socket: net.Socket | null = null;
  private options: RedisConnectionOptions;
  private isConnected = false;
  private isConnecting = false;
  private shouldReconnect = true;
  private retryAttempts = 0;
  private connectionTimeout: NodeJS.Timeout | null = null;

  private readBuffer = Buffer.alloc(0);

  // Tasks waiting to be sent
  private offlineQueue: CommandTask[] = [];
  // Tasks sent to Redis, waiting for response
  private commandQueue: CommandTask[] = [];

  constructor(options: RedisConnectionOptions = {}) {
    super();
    this.options = {
      host: '127.0.0.1',
      port: 6379,
      ...options,
    };
  }

  public connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.isConnecting = true;
      this.shouldReconnect = true;

      this.socket = net.createConnection({
        host: this.options.host,
        port: this.options.port as number,
      });

      this.socket.on('connect', async () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.retryAttempts = 0;
        this.emit('connect');

        try {
          if (this.options.password) {
            await this.sendCommand(['AUTH', this.options.password]);
          }
          if (this.options.db !== undefined && this.options.db !== 0) {
            await this.sendCommand(['SELECT', this.options.db]);
          }
          this.emit('ready');
          this.flushOfflineQueue();
          resolve();
        } catch (err) {
          this.emit('error', err);
          reject(err);
        }
      });

      this.socket.on('data', (data) => this.handleData(data));

      this.socket.on('error', (err) => {
        this.emit('error', err);
        if (this.isConnecting) {
          reject(err);
        }
      });

      this.socket.on('close', () => {
        this.isConnected = false;
        this.isConnecting = false;
        this.emit('close');

        // Reject all pending commands
        const err = new Error('Redis connection lost');
        for (const task of this.commandQueue) {
          task.reject(err);
        }
        this.commandQueue = [];

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });
    });
  }

  public async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout);

    return new Promise((resolve) => {
      if (!this.socket || !this.isConnected) {
        return resolve();
      }
      this.socket.once('close', () => resolve());
      this.socket.end();
    });
  }

  public sendCommand(args: (string | number | Buffer)[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const commandBuffer = RESP.serialize(args);
      const task: CommandTask = { resolve, reject, commandBuffer };

      if (this.isConnected) {
        this.commandQueue.push(task);
        this.socket!.write(commandBuffer);
      } else {
        this.offlineQueue.push(task);
        if (this.shouldReconnect && !this.isConnecting) {
          this.connect().catch(() => {});
        }
      }
    });
  }

  private handleData(data: Buffer) {
    this.readBuffer = Buffer.concat([this.readBuffer, data]);

    const bufferObj = { buffer: this.readBuffer };

    RESP.parseStream(bufferObj, (err, reply) => {
      const task = this.commandQueue.shift();
      if (!task) {
        // This can happen for Push messages (like pub/sub)
        this.emit('message', reply);
        return;
      }

      if (err) {
        task.reject(err);
      } else {
        task.resolve(reply);
      }
    });

    this.readBuffer = bufferObj.buffer;
  }

  private scheduleReconnect() {
    this.retryAttempts++;
    const strategy = this.options.retryStrategy || ((times) => Math.min(times * 50, 2000));
    const delay = strategy(this.retryAttempts);

    if (delay === null) {
      this.emit('error', new Error('Max retries reached.'));
      return;
    }

    this.emit('reconnecting', { attempt: this.retryAttempts, delay });
    this.connectionTimeout = setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  private flushOfflineQueue() {
    for (const task of this.offlineQueue) {
      this.commandQueue.push(task);
      this.socket!.write(task.commandBuffer);
    }
    this.offlineQueue = [];
  }
}
