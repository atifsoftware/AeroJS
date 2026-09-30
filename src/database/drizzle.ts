/**
 * @file drizzle.ts
 * @description First-Class Drizzle ORM Integration for AeroJS.
 * Provides IoC binding and HttpContext.drizzle injection.
 */

/**
 * Registers Drizzle database instance into Aero's global context and IoC container.
 */
export function useDrizzle(drizzleDb: any): any {
  (globalThis as any).__AERO_DRIZZLE__ = drizzleDb;
  return drizzleDb;
}
