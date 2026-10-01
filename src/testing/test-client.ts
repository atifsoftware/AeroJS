/**
 * @file test-client.ts
 * @description In-process testing client for Aero applications avoiding network sockets.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import type { Socket } from 'node:net';
import type { Aero } from '../core/application.js';

class MockSocket extends Duplex {
  public remoteAddress = '127.0.0.1';
  public encrypted = false;

  public override _read(): void {}
  public override _write(
    _chunk: any,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
}

export interface TestResponse {
  readonly status: number;
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
  json<T = any>(): T;
  text(): string;
  buffer(): Buffer;
}

export interface TestRequestOptions {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | number | boolean>;
}

export class TestClient {
  constructor(private readonly app: Aero<any>) {}

  public async get(url: string, options?: TestRequestOptions): Promise<TestResponse> {
    return this.request('GET', url, options);
  }

  public async post(url: string, options?: TestRequestOptions): Promise<TestResponse> {
    return this.request('POST', url, options);
  }

  public async put(url: string, options?: TestRequestOptions): Promise<TestResponse> {
    return this.request('PUT', url, options);
  }

  public async patch(url: string, options?: TestRequestOptions): Promise<TestResponse> {
    return this.request('PATCH', url, options);
  }

  public async delete(url: string, options?: TestRequestOptions): Promise<TestResponse> {
    return this.request('DELETE', url, options);
  }

  public async options(url: string, options?: TestRequestOptions): Promise<TestResponse> {
    return this.request('OPTIONS', url, options);
  }

  public async head(url: string, options?: TestRequestOptions): Promise<TestResponse> {
    return this.request('HEAD', url, options);
  }

  public async request(
    method: string,
    rawUrl: string,
    options: TestRequestOptions = {}
  ): Promise<TestResponse> {
    let finalUrl = rawUrl;
    if (options.query && Object.keys(options.query).length > 0) {
      const urlObj = new URL(rawUrl, 'http://localhost');
      for (const [k, v] of Object.entries(options.query)) {
        urlObj.searchParams.set(k, String(v));
      }
      finalUrl = `${urlObj.pathname}${urlObj.search}`;
    }

    const socket = new MockSocket();
    const req = new IncomingMessage(socket as unknown as Socket);
    req.method = method.toUpperCase();
    req.url = finalUrl;

    const headers: Record<string, string | string[]> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        if (v !== undefined) {
          headers[k.toLowerCase()] = v;
        }
      }
    }

    let payloadBuffer: Buffer | null = null;
    if (options.body !== undefined && options.body !== null) {
      if (Buffer.isBuffer(options.body)) {
        payloadBuffer = options.body;
        headers['content-type'] = headers['content-type'] || 'application/octet-stream';
      } else if (typeof options.body === 'string') {
        payloadBuffer = Buffer.from(options.body, 'utf-8');
        headers['content-type'] = headers['content-type'] || 'text/plain';
      } else {
        payloadBuffer = Buffer.from(JSON.stringify(options.body), 'utf-8');
        headers['content-type'] = headers['content-type'] || 'application/json';
      }
      headers['content-length'] = String(payloadBuffer.length);
    }

    req.headers = headers;

    if (payloadBuffer) {
      req.push(payloadBuffer);
    }
    req.push(null); // EOF

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];

    return new Promise<TestResponse>((resolve, reject) => {
      res.write = function (chunk: any, ..._rest: any[]) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return true;
      } as any;

      res.end = function (chunk?: any, ..._rest: any[]) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const fullBuffer = Buffer.concat(chunks);
        const bodyStr = fullBuffer.toString('utf-8');

        const resHeaders: Record<string, string | string[] | undefined> = {};
        for (const [k, v] of Object.entries(res.getHeaders())) {
          resHeaders[k.toLowerCase()] = v as string | string[];
        }

        const testRes: TestResponse = {
          status: res.statusCode,
          statusCode: res.statusCode,
          headers: resHeaders,
          body: bodyStr,
          text: () => bodyStr,
          buffer: () => fullBuffer,
          json: <T = any>() => {
            if (!bodyStr) return {} as T;
            return JSON.parse(bodyStr) as T;
          },
        };

        resolve(testRes);
        return res;
      } as any;

      this.app.handleRequest(req, res).catch(reject);
    });
  }
}

/**
 * Creates an in-process testing client for an Aero application.
 */
export function createTestClient(app: Aero<any>): TestClient {
  return new TestClient(app);
}
