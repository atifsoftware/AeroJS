/**
 * @file request.ts
 * @description AeroRequest wrapper around Node.js IncomingMessage.
 */

import type { IncomingMessage, IncomingHttpHeaders } from 'node:http';
import crypto from 'node:crypto';
import type { ParsedQuery, RouteParams } from './types.js';
import { parseQuery } from './utils.js';

/**
 * Options for configuring request behavior.
 */
export interface AeroRequestOptions {
  trustProxy?: boolean;
}

/**
 * AeroRequest wraps standard Node.js `IncomingMessage` providing
 * convenient access to headers, URL segments, query parameters, params, and body.
 */
export class AeroRequest {
  public readonly raw: IncomingMessage;
  public readonly method: string;
  public readonly url: string;
  public readonly path: string;
  public readonly query: ParsedQuery;
  public params: RouteParams;
  public body: unknown;
  public files: Record<string, any>;
  public readonly headers: IncomingHttpHeaders;
  public readonly header: IncomingHttpHeaders;
  public id!: string;

  private readonly trustProxy: boolean;
  private readonly customProperties: Map<string, unknown> = new Map();

  constructor(raw: IncomingMessage, options: AeroRequestOptions = {}) {
    this.raw = raw;
    this.trustProxy = Boolean(options.trustProxy);
    this.method = (raw.method ?? 'GET').toUpperCase();
    this.url = raw.url ?? '/';
    this.headers = raw.headers || {};
    this.header = raw.headers || {};
    this.id = this.headers['x-request-id'] ? String(this.headers['x-request-id']) : crypto.randomUUID();
    this.params = {};
    this.body = undefined;
    this.files = {};

    const parsedUrl = new URL(this.url, 'http://localhost');
    this.path = parsedUrl.pathname;
    this.query = parseQuery(parsedUrl.searchParams);
  }

  /**
   * Case-insensitive lookup of an HTTP request header.
   */
  public get(name: string): string | undefined {
    const lowerName = name.toLowerCase();
    const val = this.headers[lowerName];
    if (Array.isArray(val)) {
      return val.join(', ');
    }
    return val;
  }

  /**
   * Client remote IP address (honors X-Forwarded-For if trustProxy is enabled).
   */
  public get ip(): string {
    if (this.trustProxy) {
      const forwarded = this.get('x-forwarded-for');
      if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
      }
    }
    return this.raw.socket?.remoteAddress ?? '';
  }

  /**
   * Request protocol ('http' or 'https').
   */
  public get protocol(): string {
    if (this.trustProxy) {
      const proto = this.get('x-forwarded-proto');
      if (proto) {
        const first = proto.split(',')[0]?.trim();
        if (first) return first;
      }
    }
    const encrypted = 'encrypted' in this.raw.socket && Boolean((this.raw.socket as { encrypted?: boolean }).encrypted);
    return encrypted ? 'https' : 'http';
  }

  /**
   * Request hostname.
   */
  public get hostname(): string {
    const host = this.get('host');
    if (host) {
      return host.split(':')[0] ?? '';
    }
    return '';
  }

  public getCustom<T = unknown>(key: string): T | undefined {
    return this.customProperties.get(key) as T | undefined;
  }

  public setCustom(key: string, value: unknown): void {
    this.customProperties.set(key, value);
  }
}
