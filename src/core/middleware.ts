/**
 * @file middleware.ts
 * @description Onion model middleware composer for Aero framework.
 */

import type { AeroContext, DefaultState } from './context.js';
import type { Middleware, ComposedMiddleware, NextFunction } from './types.js';

/**
 * Composes an array of middleware functions into a single execution pipeline
 * following the classic Koa onion model.
 *
 * @param middlewares - Array of middleware functions to execute in order.
 * @returns Composed middleware function.
 */
export function compose<State = DefaultState>(
  middlewares: readonly Middleware<State>[]
): ComposedMiddleware<State> {
  if (!Array.isArray(middlewares)) {
    throw new TypeError('Middleware stack must be an array');
  }

  for (const fn of middlewares) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be composed of functions');
    }
  }

  return function (ctx: AeroContext<State>, next?: NextFunction): Promise<void> {
    let index = -1;

    function dispatch(i: number): Promise<void> {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }
      index = i;

      let fn: Middleware<State> | undefined = middlewares[i];
      if (i === middlewares.length) {
        fn = next ? (_ctx, _next) => next() : undefined;
      }

      if (!fn) {
        return Promise.resolve();
      }

      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}
