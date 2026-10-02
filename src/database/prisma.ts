/**
 * @file prisma.ts
 * @description First-Class Prisma ORM Integration for AeroJS.
 * Provides IoC binding, graceful connection lifecycle management, and HttpContext.prisma injection.
 */

export interface PrismaIntegrationOptions {
  autoDisconnect?: boolean;
}

/**
 * Registers Prisma Client into Aero's global context and IoC container.
 */
export function usePrisma<T = any>(prismaClient: T, options: PrismaIntegrationOptions = {}): T {
  (globalThis as any).__AERO_PRISMA__ = prismaClient;

  if (options.autoDisconnect ?? true) {
    const disconnectHandler = async () => {
      try {
        const client = prismaClient as any;
        if (client && typeof client.$disconnect === 'function') {
          await client.$disconnect();
        }
      } catch {
        // Ignore during shutdown
      }
    };

    process.once('beforeExit', disconnectHandler);
    process.once('SIGINT', disconnectHandler);
    process.once('SIGTERM', disconnectHandler);
  }

  return prismaClient;
}
