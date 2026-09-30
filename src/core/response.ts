/**
 * @file response.ts
 * @description AeroResponse wrapper around Node.js ServerResponse.
 */

import type { ServerResponse, OutgoingHttpHeaders, OutgoingHttpHeader } from 'node:http';
import { Readable } from 'node:stream';
import type { CookieOptions } from './types.js';
import { serializeCookie } from './utils.js';

/**
 * AeroResponse wraps standard Node.js `ServerResponse` with chainable status,
 * headers, cookies, redirects, and automated content-type serializers.
 */
export class AeroResponse {
  public readonly raw: ServerResponse;
  private _isSent = false;
  private _bodyPayload: unknown = undefined;
  private readonly _cookieHeaders: string[] = [];
  public isHead = false;
  public serializer?: (payload: unknown) => string;
  private readonly customProperties: Map<string, unknown> = new Map();

  constructor(raw: ServerResponse) {
    this.raw = raw;
  }

  public get headersSent(): boolean {
    return this.raw.headersSent;
  }

  public get isSent(): boolean {
    return this._isSent || this.raw.writableEnded;
  }

  public get statusCode(): number {
    return this.raw.statusCode;
  }

  public status(code: number): this {
    this.raw.statusCode = code;
    return this;
  }

  public set(
    nameOrHeaders: string | OutgoingHttpHeaders,
    value?: OutgoingHttpHeader
  ): this {
    if (this.raw.headersSent) {
      return this;
    }

    if (typeof nameOrHeaders === 'string') {
      if (value !== undefined) {
        this.raw.setHeader(nameOrHeaders, value);
      }
    } else if (typeof nameOrHeaders === 'object' && nameOrHeaders !== null) {
      for (const [key, val] of Object.entries(nameOrHeaders)) {
        if (val !== undefined) {
          this.raw.setHeader(key, val);
        }
      }
    }
    return this;
  }

  public get(name: string): OutgoingHttpHeader | undefined {
    return this.raw.getHeader(name);
  }

  public removeHeader(name: string): this {
    if (!this.raw.headersSent) {
      this.raw.removeHeader(name);
    }
    return this;
  }

  public type(contentType: string): this {
    let type = contentType;
    if (type === 'json') type = 'application/json; charset=utf-8';
    else if (type === 'html') type = 'text/html; charset=utf-8';
    else if (type === 'text') type = 'text/plain; charset=utf-8';

    return this.set('Content-Type', type);
  }

  public cookie(name: string, value: string, options: CookieOptions = {}): this {
    const cookieStr = serializeCookie(name, value, options);
    this._cookieHeaders.push(cookieStr);
    this.raw.setHeader('Set-Cookie', this._cookieHeaders);
    return this;
  }

  public clearCookie(name: string, options: CookieOptions = {}): this {
    return this.cookie(name, '', {
      ...options,
      expires: new Date(0),
      maxAge: 0,
    });
  }

  public redirect(url: string, status = 302): void {
    this.status(status);
    this.set('Location', url);
    this.type('text/plain; charset=utf-8');
    this.send(`Redirecting to ${url}`);
  }

  public json(data: unknown): void {
    if (!this.raw.getHeader('Content-Type')) {
      this.type('application/json; charset=utf-8');
    }
    const payload = this.serializer ? this.serializer(data) : JSON.stringify(data);
    this.send(payload);
  }

  public text(data: string | number | boolean): void {
    if (!this.raw.getHeader('Content-Type')) {
      this.type('text/plain; charset=utf-8');
    }
    this.send(String(data));
  }

  public html(data: string): void {
    if (!this.raw.getHeader('Content-Type')) {
      this.type('text/html; charset=utf-8');
    }
    this.send(data);
  }

  public send(data: unknown): void {
    if (this._isSent || this.raw.writableEnded) {
      return;
    }

    this._bodyPayload = data;

    if (data === null || data === undefined) {
      if (!this.raw.statusCode || this.raw.statusCode === 200) {
        this.status(204);
      }
      this.raw.removeHeader('Content-Type');
      this.raw.removeHeader('Content-Length');
      this.flushEnd();
      return;
    }

    if (data instanceof Readable) {
      this._isSent = true;
      if (!this.raw.getHeader('Content-Type')) {
        this.type('application/octet-stream');
      }
      if (this.isHead) {
        this.raw.end();
      } else {
        data.pipe(this.raw);
      }
      return;
    }

    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      if (!this.raw.getHeader('Content-Type')) {
        this.type('application/octet-stream');
      }
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      this.set('Content-Length', buffer.length);
      this.flushEnd(buffer);
      return;
    }

    if (typeof data === 'string') {
      if (!this.raw.getHeader('Content-Type')) {
        const trimmed = data.trim();
        if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
          this.type('text/html; charset=utf-8');
        } else {
          this.type('text/plain; charset=utf-8');
        }
      }
      const buffer = Buffer.from(data, 'utf-8');
      this.set('Content-Length', buffer.length);
      this.flushEnd(buffer);
      return;
    }

    if (typeof data === 'number' || typeof data === 'boolean' || typeof data === 'bigint') {
      const str = String(data);
      if (!this.raw.getHeader('Content-Type')) {
        this.type('text/plain; charset=utf-8');
      }
      const buffer = Buffer.from(str, 'utf-8');
      this.set('Content-Length', buffer.length);
      this.flushEnd(buffer);
      return;
    }

    if (typeof data === 'object') {
      if (!this.raw.getHeader('Content-Type')) {
        this.type('application/json; charset=utf-8');
      }
      const serialized = this.serializer ? this.serializer(data) : JSON.stringify(data);
      const buffer = Buffer.from(serialized, 'utf-8');
      this.set('Content-Length', buffer.length);
      this.flushEnd(buffer);
      return;
    }

    const str = String(data);
    const buffer = Buffer.from(str, 'utf-8');
    this.set('Content-Length', buffer.length);
    this.flushEnd(buffer);
  }

  private flushEnd(chunk?: Buffer): void {
    this._isSent = true;
    if (this.isHead) {
      this.raw.end();
    } else if (chunk !== undefined) {
      this.raw.end(chunk);
    } else {
      this.raw.end();
    }
  }

  public get payload(): unknown {
    return this._bodyPayload;
  }

  public set payload(val: unknown) {
    this._bodyPayload = val;
  }

  public getCustom<T = unknown>(key: string): T | undefined {
    return this.customProperties.get(key) as T | undefined;
  }

  public setCustom(key: string, value: unknown): void {
    this.customProperties.set(key, value);
  }
}
