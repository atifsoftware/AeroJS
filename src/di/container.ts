/**
 * @file container.ts
 * @description Lightweight Inversion of Control (IoC) dependency injection container for Aero.
 */

import { getParamInjections, getPropertyInjections } from './inject.js';

export type FactoryFunction<T = unknown> = (container: Container) => T;

export interface BindingDefinition<T = unknown> {
  factory: FactoryFunction<T>;
  singleton: boolean;
  resolvedInstance?: T;
}

/**
 * IoC Container providing dependency registration, singletons, instances, and auto-wiring.
 */
export class Container {
  private readonly bindings = new Map<string, BindingDefinition>();
  private readonly instances = new Map<string, unknown>();

  /**
   * Binds a service factory with transient or singleton lifecycle.
   */
  public bind<T = unknown>(
    name: string,
    factory: FactoryFunction<T>,
    singleton = false
  ): void {
    this.bindings.set(name, {
      factory: factory as FactoryFunction<unknown>,
      singleton,
    });
  }

  /**
   * Binds a singleton service factory resolved once and cached for future resolutions.
   */
  public singleton<T = unknown>(name: string, factory: FactoryFunction<T>): void {
    this.bind(name, factory, true);
  }

  /**
   * Directly registers an existing object instance as a singleton.
   */
  public instance<T = unknown>(name: string, value: T): void {
    this.instances.set(name, value);
  }

  constructor(private readonly parent?: Container) {}

  /**
   * Checks whether a binding or instance exists under the given name.
   */
  public has(name: string): boolean {
    return (
      this.instances.has(name) ||
      this.bindings.has(name) ||
      Boolean(this.parent?.has(name))
    );
  }

  /**
   * Resolves a registered service by name.
   */
  public resolve<T = unknown>(name: string): T {
    if (this.instances.has(name)) {
      return this.instances.get(name) as T;
    }

    const binding = this.bindings.get(name);
    if (binding) {
      if (binding.singleton) {
        if (binding.resolvedInstance === undefined) {
          binding.resolvedInstance = binding.factory(this);
        }
        return binding.resolvedInstance as T;
      }
      return binding.factory(this) as T;
    }

    if (this.parent) {
      return this.parent.resolve<T>(name);
    }

    throw new Error(`Cannot resolve service '${name}'. No binding registered.`);
  }

  /**
   * Creates a child IoC container inheriting all parent registrations.
   */
  public createChildContainer(): Container {
    return new Container(this);
  }

  /**
   * Instantiates a class constructor, auto-wiring its parameters and properties.
   */
  public make<T = unknown>(ctor: new (...args: any[]) => T): T {
    const paramInjections = getParamInjections(ctor);
    const args: unknown[] = [];

    if (paramInjections) {
      const maxIndex = Math.max(...Object.keys(paramInjections).map(Number));
      for (let i = 0; i <= maxIndex; i++) {
        const serviceName = paramInjections[i];
        if (serviceName && this.has(serviceName)) {
          args.push(this.resolve(serviceName));
        } else {
          args.push(undefined);
        }
      }
    } else {
      const paramTypes = (Reflect as any).getMetadata?.('design:paramtypes', ctor);
      if (Array.isArray(paramTypes) && paramTypes.length > 0) {
        for (const paramCtor of paramTypes) {
          const name = paramCtor?.name;
          if (name && this.has(name)) {
            args.push(this.resolve(name));
          } else if (typeof paramCtor === 'function') {
            args.push(this.make(paramCtor));
          }
        }
      }
    }

    const instance = new ctor(...args);

    const propInjections = getPropertyInjections(ctor.prototype);
    if (propInjections) {
      for (const [propKey, serviceName] of Object.entries(propInjections)) {
        if (this.has(serviceName)) {
          (instance as any)[propKey] = this.resolve(serviceName);
        }
      }
    }

    return instance;
  }

  /**
   * Clears all registered bindings and instances.
   */
  public clear(): void {
    this.bindings.clear();
    this.instances.clear();
  }
}
