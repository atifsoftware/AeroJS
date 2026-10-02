/**
 * @file http.ts
 * @description Central Http client facade and fluent API for AeroJS.
 */

import { HttpRequestBuilder, type HttpFakeHandler, type RequestSentRecord } from './request-builder.js';
import { HttpResponse } from './response.js';

export class Http {
  /**
   * Creates a new fluent HTTP request builder.
   */
  public static create(): HttpRequestBuilder {
    return new HttpRequestBuilder();
  }

  public static baseUrl(url: string): HttpRequestBuilder {
    return new HttpRequestBuilder().baseUrl(url);
  }

  public static withToken(token: string, type = 'Bearer'): HttpRequestBuilder {
    return new HttpRequestBuilder().withToken(token, type);
  }

  public static withBasicAuth(username: string, password = ''): HttpRequestBuilder {
    return new HttpRequestBuilder().withBasicAuth(username, password);
  }

  public static withHeaders(headers: Record<string, string>): HttpRequestBuilder {
    return new HttpRequestBuilder().withHeaders(headers);
  }

  public static withQuery(query: Record<string, any>): HttpRequestBuilder {
    return new HttpRequestBuilder().withQuery(query);
  }

  public static timeout(ms: number): HttpRequestBuilder {
    return new HttpRequestBuilder().timeout(ms);
  }

  public static retry(times = 3, delayMs = 100): HttpRequestBuilder {
    return new HttpRequestBuilder().retry(times, delayMs);
  }

  public static acceptJson(): HttpRequestBuilder {
    return new HttpRequestBuilder().acceptJson();
  }

  public static asJson(): HttpRequestBuilder {
    return new HttpRequestBuilder().asJson();
  }

  public static asForm(): HttpRequestBuilder {
    return new HttpRequestBuilder().asForm();
  }

  // --- Convenience HTTP Verbs ---

  public static get(url: string, query?: Record<string, any>): Promise<HttpResponse> {
    return new HttpRequestBuilder().get(url, query);
  }

  public static post(url: string, data?: any): Promise<HttpResponse> {
    return new HttpRequestBuilder().post(url, data);
  }

  public static put(url: string, data?: any): Promise<HttpResponse> {
    return new HttpRequestBuilder().put(url, data);
  }

  public static patch(url: string, data?: any): Promise<HttpResponse> {
    return new HttpRequestBuilder().patch(url, data);
  }

  public static delete(url: string, data?: any): Promise<HttpResponse> {
    return new HttpRequestBuilder().delete(url, data);
  }

  public static head(url: string): Promise<HttpResponse> {
    return new HttpRequestBuilder().head(url);
  }

  // --- Testing Utilities ---

  /**
   * Helper to construct a synthetic mock HttpResponse.
   */
  public static response(body: any = {}, status = 200, headers: Record<string, string> = {}): HttpResponse {
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    const headerObj = new Headers(headers);
    if (!headerObj.has('content-type') && typeof body === 'object') {
      headerObj.set('content-type', 'application/json');
    }
    return new HttpResponse(status, status === 200 ? 'OK' : 'Mock Response', headerObj, rawBody);
  }

  /**
   * Intercepts outgoing requests for testing assertions.
   */
  public static fake(
    patternOrHandler?: string | RegExp | HttpFakeHandler | Record<string, any>,
    handler?: HttpFakeHandler
  ): void {
    if (typeof patternOrHandler === 'object' && !(patternOrHandler instanceof RegExp)) {
      // Map of URL -> response or mock data
      const routes = patternOrHandler;
      HttpRequestBuilder.setFake((url) => {
        for (const [routePattern, mockResponse] of Object.entries(routes)) {
          if (url.includes(routePattern) || routePattern === '*') {
            if (mockResponse instanceof HttpResponse) {
              return mockResponse;
            }
            return Http.response(mockResponse);
          }
        }
        return Http.response({}, 404);
      });
      return;
    }

    if (typeof patternOrHandler === 'function') {
      HttpRequestBuilder.setFake(patternOrHandler);
    } else if (typeof patternOrHandler === 'string' || patternOrHandler instanceof RegExp) {
      if (handler) {
        HttpRequestBuilder.setFake(patternOrHandler, handler);
      }
    } else {
      // Default stub response if called with Http.fake()
      HttpRequestBuilder.setFake(() => Http.response({ mocked: true }, 200));
    }
  }

  /**
   * Resets all fakes and recorded requests.
   */
  public static reset(): void {
    HttpRequestBuilder.clearFakes();
  }

  public static getSent(): RequestSentRecord[] {
    return HttpRequestBuilder.getSent();
  }

  public static assertSent(callback: (request: RequestSentRecord) => boolean): void {
    const sent = HttpRequestBuilder.getSent();
    const match = sent.some(callback);
    if (!match) {
      throw new Error(`Expected HTTP request matching condition was not sent. Total requests sent: ${sent.length}`);
    }
  }

  public static assertNotSent(callback: (request: RequestSentRecord) => boolean): void {
    const sent = HttpRequestBuilder.getSent();
    const match = sent.some(callback);
    if (match) {
      throw new Error('Unexpected HTTP request matching condition was sent.');
    }
  }
}
