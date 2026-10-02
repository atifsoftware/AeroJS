/**
 * @file tenant.ts
 * @description Multi-Tenancy Data Scoping for AeroJS Models using AsyncLocalStorage.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export const TenancyContext = new AsyncLocalStorage<string | number>();

export interface TenancyOptions {
  /**
   * Column name used to scope multi-tenant queries. Default: 'tenant_id'
   */
  column?: string;
  /**
   * Resolver function to extract tenant ID from the HTTP Context.
   */
  resolver: (ctx: any) => string | number | undefined | Promise<string | number | undefined>;
  /**
   * Array of Model classes to apply the tenancy scope to.
   */
  models?: any[];
}

import { SKIP_OVERRIDE } from '../plugins/plugin.js';

export function tenancyPlugin(options: TenancyOptions) {
  const column = options.column || 'tenant_id';

  if (options.models) {
    for (const model of options.models) {
      model.tenanted = true;
      model.tenantColumn = column;
    }
  }

  const plugin = function (app: any) {
    app.use(async (ctx: any, next: any) => {
      const tenantId = await options.resolver(ctx);
      if (tenantId !== undefined) {
        await TenancyContext.run(tenantId, async () => {
          await next();
        });
      } else {
        await next();
      }
    });
  };
  (plugin as any)[SKIP_OVERRIDE] = true;
  return plugin;
}
