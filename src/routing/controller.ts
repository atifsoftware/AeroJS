/**
 * @file controller.ts
 * @description Controller resolution and handler adapter for class-based routing.
 */

import type { AeroContext, DefaultState } from '../core/context.js';
import type { Middleware } from '../core/types.js';

export type ControllerConstructor<T = any> = new (...args: any[]) => T;
export type ControllerTuple<T = any> = [ControllerConstructor<T>, string];

/**
 * Checks if a value is a controller tuple [ControllerClass, 'methodName'].
 */
export function isControllerTuple(val: unknown): val is [ControllerConstructor, string] {
  return (
    Array.isArray(val) &&
    val.length === 2 &&
    typeof val[0] === 'function' &&
    typeof val[1] === 'string'
  );
}

/**
 * Adapts a controller class and action method into an Aero Middleware function.
 * Leverages the IoC container from ctx.container if available for automatic dependency injection.
 */
export function createControllerHandler<State = DefaultState>(
  target: ControllerConstructor | [ControllerConstructor, string],
  actionName?: string
): Middleware<State> {
  let ControllerClass: ControllerConstructor;
  let action: string;

  if (isControllerTuple(target)) {
    ControllerClass = target[0];
    action = target[1];
  } else if (typeof target === 'function' && typeof actionName === 'string') {
    ControllerClass = target;
    action = actionName;
  } else {
    throw new TypeError('Invalid controller definition. Expected [Class, "method"] or (Class, "method").');
  }

  return async (ctx: AeroContext<State>) => {
    let instance: any;

    if (ctx.container && typeof (ctx.container as any).make === 'function') {
      instance = (ctx.container as any).make(ControllerClass);
    } else {
      instance = new ControllerClass();
    }

    if (typeof instance[action] !== 'function') {
      throw new Error(
        `Controller method '${action}' does not exist on ${ControllerClass.name || 'Controller'}.`
      );
    }

    const result = await instance[action](ctx);

    if (result !== undefined && !ctx.res.isSent && !ctx.res.headersSent) {
      ctx.send(result);
    }
  };
}
