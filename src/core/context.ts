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
import { SseStream, type SseOptions } from '../sse/sse.js';
import { UrlSigner } from '../security/signed-url.js';
import { Database } from '../database/connection.js';

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

  public get ip(): string {
    return this.req.ip;
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
   * Direct access to AeroJS Native Database (QueryBuilder & Connection Manager).
   */
  public get db(): typeof Database {
    if (this.container && this.container.has('db')) {
      return this.container.resolve('db');
    }
    return Database;
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

  /**
   * Direct access to underlying Native SQLite adapter if configured.
   */
  public get sqlite(): any {
    if (this.container && this.container.has('sqlite')) {
      return this.container.resolve('sqlite');
    }
    return (globalThis as any).__AERO_SQLITE__;
  }

  /**
   * Returns strongly-typed Drizzle ORM instance.
   */
  public getDrizzle<T = any>(): T {
    return this.drizzle as T;
  }

  /**
   * Returns strongly-typed Prisma Client instance.
   */
  public getPrisma<T = any>(): T {
    return this.prisma as T;
  }

  /**
   * Returns strongly-typed Knex instance.
   */
  public getKnex<T = any>(): T {
    return this.knex as T;
  }

  /**
   * Returns strongly-typed SQLite database adapter.
   */
  public getSqlite<T = any>(): T {
    return this.sqlite as T;
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


  public async can(module: string, action: string, resource?: any): Promise<boolean> {
    if (!this.container || !this.container.has('policyEngine')) {
      throw new Error('PolicyEngine not configured. Call app.usePolicyEngine() first.');
    }
    const engine = this.container.resolve<any>('policyEngine');
    const user = (this.state as any).user || (this.req as any).user;
    return await engine.check(user, module, action, resource);
  }

  public async authorize(module: string, action: string, resource?: any): Promise<void> {
    const isAllowed = await this.can(module, action, resource);
    if (!isAllowed) {
      throw new ForbiddenError(`Unauthorized to perform '${action}' on '${module}'.`);
    }
  }

  public locale = 'en';

  public t(key: string, params?: Record<string, any>): string {
    if (this.container && this.container.has('i18n')) {
      const i18n = this.container.resolve<any>('i18n');
      return i18n.t(key, params, this.locale);
    }
    return key;
  }

  public sse(options?: SseOptions): SseStream {
    return new SseStream(this.res.raw, options);
  }

  public pdf(buffer: Buffer): void {
    this.res.setHeader('Content-Type', 'application/pdf');
    this.res.send(buffer);
  }

  public thermalReceipt(buffer: Uint8Array | Buffer): void {
    this.res.setHeader('Content-Type', 'application/octet-stream');
    this.res.send(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
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

  /**
   * Verifies if the incoming request has a valid, non-expired URL signature.
   */
  public hasValidSignature(key?: string): boolean {
    const fullUrl = this.req.url || '/';
    return UrlSigner.hasValidSignature(fullUrl, key);
  }
}
