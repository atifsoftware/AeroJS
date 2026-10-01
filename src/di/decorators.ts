/**
 * @file decorators.ts
 * @description Decorator-based Dependency Injection for AeroJS.
 */

import { Container } from './container.js';

const INJECTABLE_METADATA_KEY = Symbol('aero:injectable');
const INJECT_METADATA_KEY = Symbol('aero:inject');

export function Injectable(): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(INJECTABLE_METADATA_KEY, true, target);
  };
}

export function Inject(token: string): ParameterDecorator {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const injections: { index: number; token: string }[] = Reflect.getMetadata(INJECT_METADATA_KEY, target) || [];
    injections.push({ index: parameterIndex, token });
    Reflect.defineMetadata(INJECT_METADATA_KEY, injections, target);
  };
}

export interface ModuleConfig {
  providers?: any[];
  controllers?: any[];
}

export function Module(config: ModuleConfig): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata('aero:module', config, target);
  };
}

export class ModuleRegistry {
  public static resolveController(ControllerClass: any, container: Container): any {
    const injections: { index: number; token: string }[] = Reflect.getMetadata(INJECT_METADATA_KEY, ControllerClass) || [];

    // Sort injections by parameter index to map correctly
    injections.sort((a, b) => a.index - b.index);

    const args = injections.map((inj) => {
      if (!container.has(inj.token)) {
        throw new Error(`Unmet dependency: '${inj.token}' required by '${ControllerClass.name}'`);
      }
      return container.resolve(inj.token);
    });

    return new ControllerClass(...args);
  }

  public static registerModule(ModuleClass: any, container: Container) {
    const config: ModuleConfig = Reflect.getMetadata('aero:module', ModuleClass);
    if (!config) return;

    if (config.providers) {
      for (const ProviderClass of config.providers) {
        // Simple token-based registration using class name or static token property
        const token = ProviderClass.token || ProviderClass.name;

        // Resolve nested dependencies if Provider has its own injections
        container.singleton(token, () => {
           return this.resolveController(ProviderClass, container);
        });
      }
    }

    if (config.controllers) {
      for (const ControllerClass of config.controllers) {
        // In AeroJS, controllers are usually strings or instances mounted to routes.
        // We'll store them in the container so the router can fetch them.
        container.bind(ControllerClass.name, () => {
          return this.resolveController(ControllerClass, container);
        });
      }
    }
  }
}
