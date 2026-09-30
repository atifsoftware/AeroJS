/**
 * @file hooks.ts
 * @description Centralized lifecycle hook manager for the Aero framework.
 */

import type { AeroContext, DefaultState } from './context.js';

export type OnRequestHook<State = DefaultState> = (
  ctx: AeroContext<State>
) => void | Promise<void>;

export type PreParsingHook<State = DefaultState> = (
  ctx: AeroContext<State>
) => void | Promise<void>;

export type PreValidationHook<State = DefaultState> = (
  ctx: AeroContext<State>
) => void | Promise<void>;

export type PreHandlerHook<State = DefaultState> = (
  ctx: AeroContext<State>
) => void | Promise<void>;

export type PreSerializationHook<State = DefaultState> = (
  ctx: AeroContext<State>,
  payload: unknown
) => unknown | Promise<unknown>;

export type OnSendHook<State = DefaultState> = (
  ctx: AeroContext<State>,
  payload: unknown
) => unknown | Promise<unknown>;

export type OnResponseHook<State = DefaultState> = (
  ctx: AeroContext<State>
) => void | Promise<void>;

export type OnErrorHook<State = DefaultState> = (
  error: Error,
  ctx: AeroContext<State>
) => void | Promise<void>;

export type HookName =
  | 'onRequest'
  | 'preParsing'
  | 'preValidation'
  | 'preHandler'
  | 'preSerialization'
  | 'onSend'
  | 'onResponse'
  | 'onError';

export interface HookMap<State = DefaultState> {
  onRequest: OnRequestHook<State>;
  preParsing: PreParsingHook<State>;
  preValidation: PreValidationHook<State>;
  preHandler: PreHandlerHook<State>;
  preSerialization: PreSerializationHook<State>;
  onSend: OnSendHook<State>;
  onResponse: OnResponseHook<State>;
  onError: OnErrorHook<State>;
}

export class HookRunner<State = DefaultState> {
  public readonly hooks: { [K in HookName]: HookMap<State>[K][] } = {
    onRequest: [],
    preParsing: [],
    preValidation: [],
    preHandler: [],
    preSerialization: [],
    onSend: [],
    onResponse: [],
    onError: [],
  };

  public add<K extends HookName>(name: K, handler: HookMap<State>[K]): this {
    this.hooks[name].push(handler);
    return this;
  }

  public async runOnRequest(ctx: AeroContext<State>): Promise<void> {
    for (const hook of this.hooks.onRequest) {
      await hook(ctx);
    }
  }

  public async runPreParsing(ctx: AeroContext<State>): Promise<void> {
    for (const hook of this.hooks.preParsing) {
      await hook(ctx);
    }
  }

  public async runPreValidation(ctx: AeroContext<State>): Promise<void> {
    for (const hook of this.hooks.preValidation) {
      await hook(ctx);
    }
  }

  public async runPreHandler(ctx: AeroContext<State>): Promise<void> {
    for (const hook of this.hooks.preHandler) {
      await hook(ctx);
    }
  }

  public async runPreSerialization(ctx: AeroContext<State>, payload: unknown): Promise<unknown> {
    let current = payload;
    for (const hook of this.hooks.preSerialization) {
      current = await hook(ctx, current);
    }
    return current;
  }

  public async runOnSend(ctx: AeroContext<State>, payload: unknown): Promise<unknown> {
    let current = payload;
    for (const hook of this.hooks.onSend) {
      current = await hook(ctx, current);
    }
    return current;
  }

  public async runOnResponse(ctx: AeroContext<State>): Promise<void> {
    for (const hook of this.hooks.onResponse) {
      await hook(ctx);
    }
  }

  public async runOnError(error: Error, ctx: AeroContext<State>): Promise<void> {
    for (const hook of this.hooks.onError) {
      await hook(error, ctx);
    }
  }
}
