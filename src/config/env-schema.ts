/**
 * @file env-schema.ts
 * @description Strongly-typed Environment Schema Validation for AeroJS.
 * Validates process.env on boot and throws EnvValidationError on missing or invalid configurations.
 */

export class EnvValidationError extends Error {
  public errors: string[];

  constructor(errors: string[]) {
    super(`Environment validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.name = 'EnvValidationError';
    this.errors = errors;
  }
}

export abstract class EnvField<T> {
  protected isRequired = false;
  protected defaultValue?: T;

  public required(): this {
    this.isRequired = true;
    return this;
  }

  public optional(): this {
    this.isRequired = false;
    return this;
  }

  public default(val: T): this {
    this.defaultValue = val;
    this.isRequired = false;
    return this;
  }

  public abstract parse(key: string, val: string | undefined): T;
}

export class EnvStringField extends EnvField<string> {
  private minLen?: number;
  private maxLen?: number;
  private exactLen?: number;

  public min(len: number): this {
    this.minLen = len;
    return this;
  }

  public max(len: number): this {
    this.maxLen = len;
    return this;
  }

  public length(len: number): this {
    this.exactLen = len;
    return this;
  }

  public parse(key: string, val: string | undefined): string {
    if (val === undefined || val === '') {
      if (this.isRequired) {
        throw new Error(`Environment variable '${key}' is required.`);
      }
      return this.defaultValue ?? '';
    }

    if (this.minLen !== undefined && val.length < this.minLen) {
      throw new Error(`Environment variable '${key}' must have at least ${this.minLen} characters.`);
    }

    if (this.maxLen !== undefined && val.length > this.maxLen) {
      throw new Error(`Environment variable '${key}' must have at most ${this.maxLen} characters.`);
    }

    if (this.exactLen !== undefined && val.length !== this.exactLen) {
      throw new Error(`Environment variable '${key}' must have exactly ${this.exactLen} characters.`);
    }

    return val;
  }
}

export class EnvNumberField extends EnvField<number> {
  private minVal?: number;
  private maxVal?: number;

  public min(val: number): this {
    this.minVal = val;
    return this;
  }

  public max(val: number): this {
    this.maxVal = val;
    return this;
  }

  public parse(key: string, val: string | undefined): number {
    if (val === undefined || val === '') {
      if (this.isRequired) {
        throw new Error(`Environment variable '${key}' is required.`);
      }
      return this.defaultValue ?? 0;
    }

    const num = Number(val);
    if (isNaN(num)) {
      throw new Error(`Environment variable '${key}' must be a valid number.`);
    }

    if (this.minVal !== undefined && num < this.minVal) {
      throw new Error(`Environment variable '${key}' must be at least ${this.minVal}.`);
    }

    if (this.maxVal !== undefined && num > this.maxVal) {
      throw new Error(`Environment variable '${key}' must be at most ${this.maxVal}.`);
    }

    return num;
  }
}

export class EnvBooleanField extends EnvField<boolean> {
  public parse(key: string, val: string | undefined): boolean {
    if (val === undefined || val === '') {
      if (this.isRequired) {
        throw new Error(`Environment variable '${key}' is required.`);
      }
      return this.defaultValue ?? false;
    }

    const lower = val.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;

    throw new Error(`Environment variable '${key}' must be a boolean ('true' or 'false').`);
  }
}

export class EnvEnumField<T extends string> extends EnvField<T> {
  private allowed: T[];

  constructor(allowed: T[]) {
    super();
    this.allowed = allowed;
  }

  public parse(key: string, val: string | undefined): T {
    if (val === undefined || val === '') {
      if (this.isRequired) {
        throw new Error(`Environment variable '${key}' is required.`);
      }
      return this.defaultValue as T;
    }

    if (!this.allowed.includes(val as T)) {
      throw new Error(
        `Environment variable '${key}' must be one of [${this.allowed.join(', ')}], received '${val}'.`
      );
    }

    return val as T;
  }
}

export class EnvUrlField extends EnvField<string> {
  public parse(key: string, val: string | undefined): string {
    if (val === undefined || val === '') {
      if (this.isRequired) {
        throw new Error(`Environment variable '${key}' is required.`);
      }
      return this.defaultValue ?? '';
    }

    try {
      new URL(val);
      return val;
    } catch {
      throw new Error(`Environment variable '${key}' must be a valid URL.`);
    }
  }
}

export class EnvEmailField extends EnvField<string> {
  public parse(key: string, val: string | undefined): string {
    if (val === undefined || val === '') {
      if (this.isRequired) {
        throw new Error(`Environment variable '${key}' is required.`);
      }
      return this.defaultValue ?? '';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) {
      throw new Error(`Environment variable '${key}' must be a valid email address.`);
    }

    return val;
  }
}

export class TypedEnv {
  public static string(): EnvStringField {
    return new EnvStringField();
  }

  public static number(): EnvNumberField {
    return new EnvNumberField();
  }

  public static boolean(): EnvBooleanField {
    return new EnvBooleanField();
  }

  public static enum<T extends string>(allowed: T[]): EnvEnumField<T> {
    return new EnvEnumField(allowed);
  }

  public static url(): EnvUrlField {
    return new EnvUrlField();
  }

  public static email(): EnvEmailField {
    return new EnvEmailField();
  }

  /**
   * Validates environment variables according to the provided schema definition.
   */
  public static schema<T extends Record<string, EnvField<any>>>(
    definition: T,
    source: Record<string, string | undefined> = process.env
  ): { [K in keyof T]: ReturnType<T[K]['parse']> } {
    const result = {} as any;
    const errors: string[] = [];

    for (const [key, field] of Object.entries(definition)) {
      try {
        result[key] = field.parse(key, source[key]);
      } catch (err: any) {
        errors.push(err.message);
      }
    }

    if (errors.length > 0) {
      throw new EnvValidationError(errors);
    }

    return result;
  }
}
