/**
 * @file route-builder.ts
 * @description Fluent RouteBuilder enabling chainable route configuration (.as(), .middleware(), .schema()).
 */

import type { DefaultState } from '../core/context.js';
import type { Middleware } from '../core/types.js';
import type { Route, RouteSchema, Router } from '../core/router.js';
import type { NamedMiddlewareRegistry } from './named-middleware.js';

export class RouteBuilder<State = DefaultState> {
  private readonly addedMiddlewares: (Middleware<State> | string)[] = [];
  private readonly initialHandlers: (Middleware<State> | string)[];

  constructor(
    private readonly route: Route<State>,
    private readonly router: Router<State>,
    private readonly namedMiddleware?: NamedMiddlewareRegistry<State>
  ) {
    this.initialHandlers = [...route.handlers];
  }

  /**
   * Sets the unique name for this route (used by urlFor).
   */
  public as(name: string): this {
    this.route.name = name;
    this.router.registerNamedRoute(name, this.route);
    return this;
  }

  /**
   * Alias for as(name).
   */
  public name(name: string): this {
    return this.as(name);
  }

  /**
   * Attaches one or more route-level middlewares (functions or registered names).
   * Middlewares execute sequentially in the order registered before the route handler.
   */
  public middleware(...middlewares: (Middleware<State> | string)[]): this {
    this.addedMiddlewares.push(...middlewares);
    this.route.handlers = [...this.addedMiddlewares, ...this.initialHandlers];
    return this;
  }

  /**
   * Alias for middleware().
   */
  public use(...middlewares: (Middleware<State> | string)[]): this {
    return this.middleware(...middlewares);
  }

  /**
   * Attaches schema validation rules to this route.
   */
  public schema(schema: RouteSchema): this {
    this.route.schema = {
      ...this.route.schema,
      ...schema,
    };
    return this;
  }

  /**
   * Returns the underlying Route object.
   */
  public getRoute(): Route<State> {
    return this.route;
  }

  // Chaining support for defining subsequent routes directly
  public get(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.get(path, ...handlers);
  }

  public post(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.post(path, ...handlers);
  }

  public put(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.put(path, ...handlers);
  }

  public patch(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.patch(path, ...handlers);
  }

  public delete(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.delete(path, ...handlers);
  }

  public options(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.options(path, ...handlers);
  }

  public head(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.head(path, ...handlers);
  }

  public all(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.all(path, ...handlers);
  }
}
