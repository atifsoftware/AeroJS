/**
 * @file route-group.ts
 * @description Route groups allowing shared prefixes and group-level middleware.
 */

import type { DefaultState } from '../core/context.js';
import type { Middleware } from '../core/types.js';
import { normalizePath } from '../core/utils.js';
import type { Router } from '../core/router.js';
import type { RouteBuilder } from './route-builder.js';
import type { NamedMiddlewareRegistry } from './named-middleware.js';

export class RouteGroup<State = DefaultState> {
  private readonly middlewares: (Middleware<State> | string)[] = [];

  constructor(
    public readonly prefix: string,
    private readonly router: Router<State>,
    private readonly namedMiddleware?: NamedMiddlewareRegistry<State>,
    parentMiddlewares: (Middleware<State> | string)[] = []
  ) {
    this.middlewares.push(...parentMiddlewares);
  }

  /**
   * Adds group-level middleware executed on every route in this group.
   */
  public use(...middlewares: (Middleware<State> | string)[]): this {
    this.middlewares.push(...middlewares);
    return this;
  }

  /**
   * Alias for use().
   */
  public middleware(...middlewares: (Middleware<State> | string)[]): this {
    return this.use(...middlewares);
  }

  /**
   * Creates a nested route group inheriting parent prefix and middlewares.
   */
  public group(prefix: string, callback: (group: RouteGroup<State>) => void): this {
    const combinedPrefix = this.combinePrefixes(this.prefix, prefix);
    const childGroup = new RouteGroup<State>(
      combinedPrefix,
      this.router,
      this.namedMiddleware,
      [...this.middlewares]
    );
    callback(childGroup);
    return this;
  }

  public get(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.addRoute('GET', path, handlers);
  }

  public post(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.addRoute('POST', path, handlers);
  }

  public put(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.addRoute('PUT', path, handlers);
  }

  public patch(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.addRoute('PATCH', path, handlers);
  }

  public delete(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.addRoute('DELETE', path, handlers);
  }

  public options(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.addRoute('OPTIONS', path, handlers);
  }

  public head(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.addRoute('HEAD', path, handlers);
  }

  public all(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.addRoute('ALL', path, handlers);
  }

  private addRoute(method: string, path: string, handlers: any[]): RouteBuilder<State> {
    const fullPath = this.combinePrefixes(this.prefix, path);
    return this.router.add(
      method,
      fullPath,
      [...this.middlewares, ...handlers]
    );
  }

  private combinePrefixes(base: string, sub: string): string {
    const cleanBase = normalizePath(base);
    const cleanSub = normalizePath(sub);
    if (cleanSub === '/') {
      return cleanBase;
    }
    if (cleanBase === '/') {
      return cleanSub;
    }
    return normalizePath(`${cleanBase}/${cleanSub}`);
  }
}
