/**
 * @file drizzle.ts
 * @description First-Class Drizzle ORM Integration for AeroJS.
 * Provides IoC binding and HttpContext.drizzle injection.
 */

export interface DrizzleIntegrationOptions {
  name?: string;
}

/**
 * Registers Drizzle database instance into Aero's global context and IoC container.
 */
export function useDrizzle<T = any>(drizzleDb: T, _options?: DrizzleIntegrationOptions): T {
  (globalThis as any).__AERO_DRIZZLE__ = drizzleDb;
  return drizzleDb;
}
