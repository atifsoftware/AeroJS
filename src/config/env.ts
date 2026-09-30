/**
 * @file env.ts
 * @description Environment variable loader and validator with type coercion and required checks.
 */

export interface EnvRule {
  type?: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: unknown;
}

export class Env {
  public get(key: string, defaultValue?: string): string {
    const val = process.env[key];
    if (val !== undefined) {
      return val;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return '';
  }

  public getNumber(key: string, defaultValue?: number): number {
    const val = process.env[key];
    if (val !== undefined) {
      const num = Number(val);
      if (!isNaN(num)) return num;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return 0;
  }

  public getBoolean(key: string, defaultValue?: boolean): boolean {
    const val = process.env[key];
    if (val !== undefined) {
      return val === 'true' || val === '1' || val === 'yes';
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return false;
  }

  public require(key: string): string {
    const val = process.env[key];
    if (val === undefined || val.trim() === '') {
      throw new Error(`Environment variable '${key}' is required but not set.`);
    }
    return val;
  }

  public validate(schema: Record<string, EnvRule>): Record<string, unknown> {
    const validated: Record<string, unknown> = {};

    for (const [key, rule] of Object.entries(schema)) {
      const rawVal = process.env[key];

      if (rawVal === undefined || rawVal.trim() === '') {
        if (rule.required && rule.default === undefined) {
          throw new Error(`Required environment variable '${key}' is missing.`);
        }
        validated[key] = rule.default;
        continue;
      }

      if (rule.type === 'number') {
        const num = Number(rawVal);
        if (isNaN(num)) {
          throw new Error(`Environment variable '${key}' must be a number, received: '${rawVal}'.`);
        }
        validated[key] = num;
      } else if (rule.type === 'boolean') {
        validated[key] = rawVal === 'true' || rawVal === '1' || rawVal === 'yes';
      } else {
        validated[key] = rawVal;
      }
    }

    return validated;
  }
}

export const env = new Env();
