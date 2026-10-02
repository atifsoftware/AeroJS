/**
 * @file request-builder.ts
 * @description Fluent Request Builder for AeroJS HTTP client.
 */

import { HttpResponse } from './response.js';

export type HttpFakeHandler = (url: string, init?: RequestInit) => HttpResponse | Promise<HttpResponse>;

export interface RequestSentRecord {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
}

export class HttpRequestBuilder {
  private _baseUrl = '';
  private _headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
  };
  private _query: Record<string, any> = {};
  private _timeoutMs = 30000;
  private _retryCount = 0;
  private _retryDelayMs = 100;
  private _contentType = 'application/json';

  // Global fakes / sent tracking references injected by Http facade
  private static fakeHandlers: Map<string | RegExp, HttpFakeHandler> = new Map();
  private static defaultFakeHandler?: HttpFakeHandler;
  private static sentRequests: RequestSentRecord[] = [];

  public static setFake(pattern: string | RegExp | HttpFakeHandler, handler?: HttpFakeHandler): void {
    if (typeof pattern === 'function') {
      this.defaultFakeHandler = pattern;
    } else if (handler) {
      this.fakeHandlers.set(pattern, handler);
    }
  }

  public static clearFakes(): void {
    this.fakeHandlers.clear();
    this.defaultFakeHandler = undefined;
    this.sentRequests = [];
  }

  public static recordSent(record: RequestSentRecord): void {
    this.sentRequests.push(record);
  }

  public static getSent(): RequestSentRecord[] {
    return this.sentRequests;
  }

  public baseUrl(url: string): this {
    this._baseUrl = url.replace(/\/+$/, '');
    return this;
  }

  public withHeaders(headers: Record<string, string>): this {
    Object.assign(this._headers, headers);
    return this;
  }

  public withToken(token: string, type = 'Bearer'): this {
    this._headers['Authorization'] = `${type} ${token}`.trim();
    return this;
  }

  public withBasicAuth(username: string, password = ''): this {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    this._headers['Authorization'] = `Basic ${credentials}`;
    return this;
  }

  public accept(mimeType: string): this {
    this._headers['Accept'] = mimeType;
    return this;
  }

  public acceptJson(): this {
    return this.accept('application/json');
  }

  public asJson(): this {
    this._contentType = 'application/json';
    return this;
  }

  public asForm(): this {
    this._contentType = 'application/x-www-form-urlencoded';
    return this;
  }

  public withQuery(query: Record<string, any>): this {
    Object.assign(this._query, query);
    return this;
  }

  public timeout(ms: number): this {
    this._timeoutMs = ms;
    return this;
  }

  public retry(times = 3, delayMs = 100): this {
    this._retryCount = times;
    this._retryDelayMs = delayMs;
    return this;
  }

  // --- HTTP Verbs ---

  public get(url: string, query?: Record<string, any>): Promise<HttpResponse> {
    if (query) this.withQuery(query);
    return this.send('GET', url);
  }

  public post(url: string, data?: any): Promise<HttpResponse> {
    return this.send('POST', url, data);
  }

  public put(url: string, data?: any): Promise<HttpResponse> {
    return this.send('PUT', url, data);
  }

  public patch(url: string, data?: any): Promise<HttpResponse> {
    return this.send('PATCH', url, data);
  }

  public delete(url: string, data?: any): Promise<HttpResponse> {
    return this.send('DELETE', url, data);
  }

  public head(url: string): Promise<HttpResponse> {
    return this.send('HEAD', url);
  }

  // --- Request Dispatcher ---

  public async send(method: string, path: string, data?: any): Promise<HttpResponse> {
    let fullUrl = path.startsWith('http://') || path.startsWith('https://')
      ? path
      : `${this._baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    // Append query parameters
    const queryString = new URLSearchParams();
    for (const [key, value] of Object.entries(this._query)) {
      if (value !== undefined && value !== null) {
        queryString.append(key, String(value));
      }
    }
    const queryPart = queryString.toString();
    if (queryPart) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryPart;
    }

    const headers: Record<string, string> = { ...this._headers };
    let body: any = undefined;

    if (data !== undefined && data !== null && method !== 'GET' && method !== 'HEAD') {
      if (this._contentType === 'application/json') {
        headers['Content-Type'] = 'application/json';
        body = typeof data === 'string' ? data : JSON.stringify(data);
      } else if (this._contentType === 'application/x-www-form-urlencoded') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(data).toString();
      } else {
        body = data;
      }
    }

    HttpRequestBuilder.recordSent({
      url: fullUrl,
      method: method.toUpperCase(),
      headers,
      body: data,
    });

    // Check for fakes
    const fake = this.findFake(fullUrl);
    if (fake) {
      return await fake(fullUrl, { method, headers, body });
    }

    // Perform actual fetch with retry logic and timeout
    let lastError: any;
    const maxAttempts = 1 + this._retryCount;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this._timeoutMs);

      try {
        const res = await fetch(fullUrl, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        clearTimeout(timer);
        const text = await res.text();
        return new HttpResponse(res.status, res.statusText, res.headers, text);
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err;
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, this._retryDelayMs * attempt));
        }
      }
    }

    throw lastError;
  }

  private findFake(url: string): HttpFakeHandler | undefined {
    for (const [pattern, handler] of HttpRequestBuilder.fakeHandlers.entries()) {
      if (typeof pattern === 'string' && url.includes(pattern)) {
        return handler;
      }
      if (pattern instanceof RegExp && pattern.test(url)) {
        return handler;
      }
    }
    return HttpRequestBuilder.defaultFakeHandler;
  }
}
