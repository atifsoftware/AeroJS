/**
 * @file plugin.ts
 * @description Fastify-style plugin system with scope encapsulation, options, and metadata.
 */

import type { Aero } from '../core/application.js';
import type { DefaultState } from '../core/context.js';

export interface PluginOptions {
  prefix?: string;
  [key: string]: unknown;
}

export const SKIP_OVERRIDE: unique symbol = Symbol('aero.skip-override');

export interface PluginMetadata {
  name?: string;
  version?: string;
  dependencies?: string[];
  [SKIP_OVERRIDE]?: boolean;
}

export type AeroPlugin<Options = Record<string, unknown>, State = DefaultState> = ((
  app: Aero<State>,
  options?: Options
) => void | Promise<void>) &
  PluginMetadata;

/**
 * Marks a plugin to skip encapsulation so that its decorators, hooks,
 * and middleware are registered directly onto the root/parent application scope.
 * (Equivalent to fastify-plugin).
 */
export function createPlugin<Options = Record<string, unknown>, State = DefaultState>(
  fn: (app: Aero<State>, options?: Options) => void | Promise<void>,
  metadata: PluginMetadata = {}
): AeroPlugin<Options, State> {
  const plugin = fn as AeroPlugin<Options, State>;
  Object.assign(plugin, metadata);
  plugin[SKIP_OVERRIDE] = true;
  return plugin;
}
