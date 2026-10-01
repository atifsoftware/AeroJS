/**
 * @file sse.ts
 * @description Server-Sent Events (SSE) Streaming Engine for AeroJS.
 */

import type { ServerResponse } from 'node:http';

export interface SseOptions {
  heartbeatMs?: number;
  retryMs?: number;
}

export class SseStream {
  private res: ServerResponse;
  private heartbeatTimer?: NodeJS.Timeout;
  private isClosed = false;

  constructor(res: ServerResponse, options: SseOptions = {}) {
    this.res = res;

    // Headers for SSE specification
    if (!this.res.headersSent) {
      this.res.setHeader('Content-Type', 'text/event-stream');
      this.res.setHeader('Cache-Control', 'no-cache, no-transform');
      this.res.setHeader('Connection', 'keep-alive');
      this.res.setHeader('X-Accel-Buffering', 'no');
      this.res.statusCode = 200;
    }


    if (options.retryMs) {
      this.res.write(`retry: ${options.retryMs}\n\n`);
    }

    if (options.heartbeatMs) {
      this.heartbeat(options.heartbeatMs);
    }

    this.res.on('close', () => {
      this.close();
    });
  }

  /**
   * Send data to client with optional event name.
   */
  public send(data: any, eventName?: string): this {
    if (this.isClosed) return this;

    if (eventName) {
      this.res.write(`event: ${eventName}\n`);
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const lines = payload.split('\n');
    for (const line of lines) {
      this.res.write(`data: ${line}\n`);
    }
    this.res.write('\n\n');
    return this;
  }

  /**
   * Send a named event to client.
   */
  public sendEvent(type: string, data: any): this {
    return this.send(data, type);
  }

  /**
   * Starts a recurring heartbeat to keep the HTTP connection alive.
   */
  public heartbeat(ms: number = 30000): this {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.isClosed) {
        clearInterval(this.heartbeatTimer);
        return;
      }
      this.res.write(': ping\n\n');
    }, ms);

    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }

    return this;
  }

  /**
   * Closes the SSE stream.
   */
  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (!this.res.writableEnded) {
      this.res.end();
    }
  }
}
