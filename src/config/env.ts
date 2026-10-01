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

import { existsSync, readFileSync } from 'node:fs';

export const env = new Env();

/**
 * Loads .env file into process.env with zero external dependencies.
 */
export function loadEnv(filePath = '.env'): void {
  if (typeof (process as any).loadEnvFile === 'function' && existsSync(filePath)) {
    try {
      (process as any).loadEnvFile(filePath);
      return;
    } catch {
      // Fallback to manual line parser
    }
  }

  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore environment file loading errors
  }
}


