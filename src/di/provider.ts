/**
 * @file provider.ts
 * @description ServiceProvider base class for modular bootstrapping and IoC binding registration.
 */

import type { Aero } from '../core/application.js';

export interface ServiceProviderConstructor {
  new (app: Aero<any>): ServiceProvider;
}

/**
 * Abstract ServiceProvider enabling modular component bootstrapping and lifecycle hooks.
 */
export abstract class ServiceProvider {
  constructor(protected readonly app: Aero<any>) {}

  /**
   * Registers bindings and singletons inside the app.container.
   */
  public register(): void | Promise<void> {}

  /**
   * Boots the service after all providers have completed their register() phase.
   */
  public boot(): void | Promise<void> {}

  /**
   * Executed when all providers have completed their boot() phase.
   */
  public ready(): void | Promise<void> {}

  /**
   * Executed on server shutdown in reverse registration order.
   */
  public shutdown(): void | Promise<void> {}
}
