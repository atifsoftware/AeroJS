/**
 * @file named-middleware.ts
 * @description Named middleware registry allowing reusable, named middleware across routes and groups.
 */

import type { DefaultState } from '../core/context.js';
import type { Middleware } from '../core/types.js';

export class NamedMiddlewareRegistry<State = DefaultState> {
  private readonly middlewares = new Map<string, Middleware<State>>();

  /**
   * Registers a middleware function under a specific name.
   */
  public register(name: string, middleware: Middleware<State>): this {
    if (typeof middleware !== 'function') {
      throw new TypeError(`Named middleware '${name}' must be a function, received ${typeof middleware}`);
    }
    this.middlewares.set(name, middleware);
    return this;
  }

  /**
   * Retrieves a named middleware by key.
   * Throws an error if the named middleware is not registered.
   */
  public get(name: string): Middleware<State> {
    const mw = this.middlewares.get(name);
    if (!mw) {
      throw new Error(`Named middleware '${name}' is not registered.`);
    }
    return mw;
  }

  /**
   * Checks whether a named middleware is registered.
   */
  public has(name: string): boolean {
    return this.middlewares.has(name);
  }

  /**
   * Returns a copy of all registered named middlewares.
   */
  public all(): Map<string, Middleware<State>> {
    return new Map(this.middlewares);
  }
}
