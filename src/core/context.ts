/**
 * @file context.ts
 * @description AeroContext unifying HTTP request, response, state, cookies, IoC container, and helpers.
 */

import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders, OutgoingHttpHeader } from 'node:http';
import * as crypto from 'node:crypto';
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
  UnprocessableEntityError,
} from './errors.js';
import { Logger } from '../logging/logger.js';

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

  public log = {
    emergency: (message: string, context?: Record<string, unknown>) => Logger.emergency(message, context),
    alert: (message: string, context?: Record<string, unknown>) => Logger.alert(message, context),
    critical: (message: string, context?: Record<string, unknown>) => Logger.critical(message, context),
    error: (message: string, context?: Record<string, unknown>) => Logger.error(message, context),
    warning: (message: string, context?: Record<string, unknown>) => Logger.warning(message, context),
    notice: (message: string, context?: Record<string, unknown>) => Logger.notice(message, context),
    info: (message: string, context?: Record<string, unknown>) => Logger.info(message, context),
    debug: (message: string, context?: Record<string, unknown>) => Logger.debug(message, context),
  };

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

  /**
   * Retrieves the first uploaded file matching fieldName.
   */
  public file(name: string): any {
    return this.req.files[name]?.[0];
  }

  /**
   * Retrieves all uploaded files, optionally filtered by fieldName.
   */
  public files(name?: string): any[] {
    if (name) {
      return this.req.files[name] || [];
    }
    return Object.values(this.req.files).flat();
  }

  /**
   * Direct access to underlying Knex.js query builder instance if configured.
   */
  public get knex(): any {
    if (this.container && this.container.has('knex')) {
      return this.container.resolve('knex');
    }
    return (globalThis as any).__AERO_KNEX__;
  }

  /**
   * Direct access to underlying Prisma Client instance if configured.
   */
  public get prisma(): any {
    if (this.container && this.container.has('prisma')) {
      return this.container.resolve('prisma');
    }
    return (globalThis as any).__AERO_PRISMA__;
  }

  /**
   * Direct access to underlying Drizzle ORM instance if configured.
   */
  public get drizzle(): any {
    if (this.container && this.container.has('drizzle')) {
      return this.container.resolve('drizzle');
    }
    return (globalThis as any).__AERO_DRIZZLE__;
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

  public setCookie(name: string, value: string, options?: CookieOptions): this {
    return this.cookie(name, value, options);
  }

    public setEncryptedCookie(name: string, value: string, options?: CookieOptions): this {
    const keyHex = process.env['AERO_KEY'];
    if (!keyHex || keyHex.length !== 64) {
      throw new Error('AERO_KEY must be exactly 64 hex characters (32 bytes) to use encrypted cookies.');
    }

    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const payload = `${iv.toString('hex')}:${authTag}:${encrypted}`;

    return this.setCookie(name, payload, options);
  }

  public getEncryptedCookie(name: string): string | undefined {
    const payload = this.cookies[name];
    if (!payload) return undefined;

    const keyHex = process.env['AERO_KEY'];
    if (!keyHex || keyHex.length !== 64) return undefined;

    try {
      const parts = payload.split(':');
      if (parts.length !== 3) return undefined;

      const [ivHex, authTagHex, encryptedHex] = parts;
      const key = Buffer.from(keyHex, 'hex');
      const iv = Buffer.from(ivHex as string, 'hex');
      const authTag = Buffer.from(authTagHex as string, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted: string = decipher.update(encryptedHex as string, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      return undefined; // Tampered or invalid cookie
    }
  }

  public clearCookie(name: string, options?: CookieOptions): this {
    this.res.clearCookie(name, options);
    return this;
  }

  public status(code: number): this {
    this.res.status(code);
    return this;
  }

  public type(contentType: string): this {
    this.res.type(contentType);
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
      case 422:
        throw new UnprocessableEntityError(message ?? 'Validation Failed', (details as any) || {});
      case 500:
        throw new InternalError(message ?? 'Internal Server Error', undefined, details);
      default:
        throw new AeroError(message ?? `HTTP Error ${status}`, status, undefined, details);
    }
  }

  /**
   * Validates incoming request data (combines params, query, and body).
   * Accepts either:
   * 1. A VineJS schema / compiled validator
   * 2. A string rules object (e.g. { name: 'required|min:3', email: 'required|email' })
   *
   * @throws {UnprocessableEntityError} with 422 status if validation fails.
   */
  public async validate<T = any>(
    schemaOrRules: any,
    options: {
      messages?: Record<string, string>;
      labels?: Record<string, string>;
      locale?: 'bn' | 'en';
    } = {}
  ): Promise<T> {
    const rawData = {
      ...(typeof this.params === 'object' && this.params !== null ? this.params : {}),
      ...(typeof this.query === 'object' && this.query !== null ? this.query : {}),
      ...(typeof this.body === 'object' && this.body !== null ? this.body : {}),
    };

    // If VineJS schema or compiled validator
    if (
      schemaOrRules &&
      typeof schemaOrRules === 'object' &&
      ('validate' in schemaOrRules || 'schema' in schemaOrRules)
    ) {
      const { VineHelper } = await import('../validation/vine.js');
      return await VineHelper.validate<T>(schemaOrRules, rawData, options.messages || {});
    }

    // String rules validator
    const { Validator } = await import('../validation/rules-validator.js');
    const validator = await Validator.makeAsync(
      rawData,
      schemaOrRules,
      options.messages || {},
      options.labels || {},
      options.locale || 'bn'
    );

    if (validator.fails()) {
      const errors = validator.errors();
      const firstMsg = validator.first() || 'Validation failed';
      throw new UnprocessableEntityError(firstMsg, errors);
    }

    return validator.validated() as T;
  }
}
