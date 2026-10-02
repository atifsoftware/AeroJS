/**
 * @file policy.ts
 * @description Typed Permission Policy Engine for AeroJS.
 * Handles 3-Tier authorization: Module -> Action -> Data Scope.
 */

import { ForbiddenError } from '../core/errors.js';

export type PolicyFunction = (user: any, resource?: any) => boolean | Promise<boolean>;

export class PolicyEngine {
  private policies = new Map<string, PolicyFunction>();

  /**
   * Defines a policy for a specific module and action.
   * Format: `define('module:action', callback)`
   */
  public define(moduleAction: string, policyFn: PolicyFunction): this {
    this.policies.set(moduleAction, policyFn);
    return this;
  }

  /**
   * Checks if a user is authorized for the given module and action.
   */
  public async check(user: any, module: string, action: string, resource?: any): Promise<boolean> {
    if (!user) return false;

    // Check wildcard action for module (e.g. 'Patient:*')
    const wildcardKey = `${module}:*`;
    if (this.policies.has(wildcardKey)) {
      const fn = this.policies.get(wildcardKey)!;
      if (await fn(user, resource)) return true;
    }

    // Check specific action
    const key = `${module}:${action}`;
    if (this.policies.has(key)) {
      const fn = this.policies.get(key)!;
      return await fn(user, resource);
    }

    // Default deny if no policy matches
    return false;
  }
}

import { SKIP_OVERRIDE } from '../plugins/plugin.js';

export function policyPlugin(engine: PolicyEngine) {
  const plugin = function (app: any) {
    // Bind to the container for access inside Context
    app.container.singleton('policyEngine', () => engine);
  };
  (plugin as any)[SKIP_OVERRIDE] = true;
  return plugin;
}
