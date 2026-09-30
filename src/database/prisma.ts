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
export function usePrisma(prismaClient: any, options: PrismaIntegrationOptions = {}): any {
  (globalThis as any).__AERO_PRISMA__ = prismaClient;

  if (options.autoDisconnect ?? true) {
    const disconnectHandler = async () => {
      try {
        if (prismaClient && typeof prismaClient.$disconnect === 'function') {
          await prismaClient.$disconnect();
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
