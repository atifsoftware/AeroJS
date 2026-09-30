/**
 * @file request-context.ts
 * @description Global Request Context tracking using Node.js AsyncLocalStorage.
 * Allows models, services, and loggers to access the active HTTP context without manual prop-drilling.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { AeroContext } from '../core/context.js';

export interface RequestStore {
  ctx: AeroContext<any>;
  requestId?: string;
  user?: any;
  [key: string]: any;
}

export class RequestContext {
  private static storage = new AsyncLocalStorage<RequestStore>();

  /**
   * Run a function within an asynchronous request context.
   */
  public static run<R>(store: RequestStore, callback: () => R): R {
    return this.storage.run(store, callback);
  }

  /**
   * Get the active request store, or undefined if outside a request lifecycle.
   */
  public static getStore(): RequestStore | undefined {
    return this.storage.getStore();
  }

  /**
   * Get the current AeroContext, if available.
   */
  public static currentContext(): AeroContext<any> | undefined {
    return this.storage.getStore()?.ctx;
  }
}

export default RequestContext;
