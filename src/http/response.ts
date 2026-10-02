/**
 * @file response.ts
 * @description Fluent HTTP Response wrapper for AeroJS HTTP client.
 */

export class HttpClientError extends Error {
  public response: HttpResponse;
  public status: number;

  constructor(response: HttpResponse, message?: string) {
    super(message || `HTTP request failed with status ${response.status} (${response.statusText})`);
    this.name = 'HttpClientError';
    this.response = response;
    this.status = response.status;
  }
}

export class HttpResponse {
  public readonly status: number;
  public readonly statusText: string;
  public readonly headers: Headers;
  public readonly rawBody: string;
  private parsedJson: any = undefined;

  constructor(status: number, statusText: string, headers: Headers, rawBody: string) {
    this.status = status;
    this.statusText = statusText;
    this.headers = headers;
    this.rawBody = rawBody;
  }

  public get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  public get successful(): boolean {
    return this.ok;
  }

  public get failed(): boolean {
    return !this.ok;
  }

  public get clientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  public get serverError(): boolean {
    return this.status >= 500 && this.status < 600;
  }

  public json<T = any>(): T {
    if (this.parsedJson !== undefined) {
      return this.parsedJson;
    }
    if (!this.rawBody) {
      return null as any;
    }
    this.parsedJson = JSON.parse(this.rawBody);
    return this.parsedJson;
  }

  public text(): string {
    return this.rawBody;
  }

  public header(name: string): string | null {
    return this.headers.get(name);
  }

  /**
   * Throws an error if the response returned a 4xx or 5xx status code.
   */
  public throw(): this {
    if (this.failed) {
      throw new HttpClientError(this);
    }
    return this;
  }

  /**
   * Throws an error unless the response matches the expected status code.
   */
  public throwUnlessStatus(expectedStatus: number): this {
    if (this.status !== expectedStatus) {
      throw new HttpClientError(
        this,
        `Expected status ${expectedStatus} but received ${this.status} (${this.statusText})`
      );
    }
    return this;
  }
}
