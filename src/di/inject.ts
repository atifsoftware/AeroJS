/**
 * @file inject.ts
 * @description Zero-dependency dependency injection decorator helpers.
 */

const INJECT_PARAMS_KEY = Symbol('aero:inject_params');
const INJECT_PROPS_KEY = Symbol('aero:inject_props');

/**
 * Decorator to mark a property or parameter for injection by service name.
 */
export function inject(serviceName: string) {
  return function (target: any, propertyKey?: string | symbol, parameterIndex?: number): void {
    if (typeof parameterIndex === 'number') {
      const existingInjections: Record<number, string> =
        target[INJECT_PARAMS_KEY] || {};
      existingInjections[parameterIndex] = serviceName;
      target[INJECT_PARAMS_KEY] = existingInjections;
    } else if (propertyKey) {
      const existingProps: Record<string | symbol, string> =
        target[INJECT_PROPS_KEY] || {};
      existingProps[propertyKey] = serviceName;
      target[INJECT_PROPS_KEY] = existingProps;
    }
  };
}

export function getParamInjections(target: any): Record<number, string> | undefined {
  return target[INJECT_PARAMS_KEY];
}

export function getPropertyInjections(target: any): Record<string | symbol, string> | undefined {
  return target[INJECT_PROPS_KEY];
}
