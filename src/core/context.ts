/**
 * @file context.ts
 * @description AeroContext unifying HTTP request, response, state, cookies, IoC container, and helpers.
 */

import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders, OutgoingHttpHeader } from 'node:http';
import { AeroRequest } from './request.js';
import { AeroResponse } from './response.js';
import type { CookieOptions, ParsedQuery, RouteParams } from './types.js';
import { parseCookies } from './utils.js';
import {
  AeroError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  MethodNotAllowedError,
  InternalError,
} from './errors.js';

export type DefaultState = Record<string, unknown>;

export interface ContainerLike {
  resolve<T>(name: string): T;
  has(name: string): boolean;
}

/**
 * AeroContext encapsulating the complete request-response cycle.
 */
export class AeroContext<State = DefaultState, Params = RouteParams> {
  public readonly req: AeroRequest;
  public readonly res: AeroResponse;
  public state: State;
  public container?: ContainerLike;

  private _cachedCookies?: Record<string, string>;

  constructor(
    req: AeroRequest | IncomingMessage,
    res: AeroResponse | ServerResponse,
    state: State = {} as State,
    container?: ContainerLike
  ) {
    this.req = req instanceof AeroRequest ? req : new AeroRequest(req);
    this.res = res instanceof AeroResponse ? res : new AeroResponse(res);
    this.state = state;
    this.container = container;
  }

  public get rawReq(): IncomingMessage {
    return this.req.raw;
  }

  public get rawRes(): ServerResponse {
    return this.res.raw;
  }

  public get method(): string {
    return this.req.method;
  }

  public get url(): string {
    return this.req.url;
  }

  public get path(): string {
    return this.req.path;
  }

  public get query(): ParsedQuery {
    return this.req.query;
  }

  public get params(): Params {
    return this.req.params as unknown as Params;
  }

  public set params(val: Params) {
    this.req.params = val as unknown as RouteParams;
  }

  public get body(): unknown {
    return this.req.body;
  }

  public set body(val: unknown) {
    this.req.body = val;
  }

  public get headers(): IncomingMessage['headers'] {
    return this.req.headers;
  }

  public header(name: string): string | undefined {
    return this.req.get(name);
  }

  public get cookies(): Record<string, string> {
    if (!this._cachedCookies) {
      this._cachedCookies = parseCookies(this.req.get('cookie'));
    }
    return this._cachedCookies;
  }

  public cookie(name: string, value: string, options?: CookieOptions): this {
    this.res.cookie(name, value, options);
    return this;
  }

  public clearCookie(name: string, options?: CookieOptions): this {
    this.res.clearCookie(name, options);
    return this;
  }

  public status(code: number): this {
    this.res.status(code);
    return this;
  }

  public set(
    nameOrHeaders: string | OutgoingHttpHeaders,
    value?: OutgoingHttpHeader
  ): this {
    this.res.set(nameOrHeaders, value);
    return this;
  }

  public get(name: string): OutgoingHttpHeader | undefined {
    return this.res.get(name);
  }

  public json(data: unknown): void {
    this.res.type('application/json; charset=utf-8');
    this.res.payload = data;
  }

  public text(data: string | number | boolean): void {
    this.res.type('text/plain; charset=utf-8');
    this.res.payload = String(data);
  }

  public html(data: string): void {
    this.res.type('text/html; charset=utf-8');
    this.res.payload = data;
  }

  public send(data: unknown): void {
    this.res.payload = data;
  }

  public redirect(url: string, status?: number): void {
    this.res.redirect(url, status);
  }

  public throw(status: number, message?: string, details?: unknown): never {
    switch (status) {
      case 400:
        throw new BadRequestError(message ?? 'Bad Request', undefined, details);
      case 401:
        throw new UnauthorizedError(message ?? 'Unauthorized', undefined, details);
      case 403:
        throw new ForbiddenError(message ?? 'Forbidden', undefined, details);
      case 404:
        throw new NotFoundError(message ?? 'Not Found', undefined, details);
      case 405:
        throw new MethodNotAllowedError(message ?? 'Method Not Allowed');
      case 500:
        throw new InternalError(message ?? 'Internal Server Error', undefined, details);
      default:
        throw new AeroError(message ?? `HTTP Error ${status}`, status, undefined, details);
    }
  }
}
