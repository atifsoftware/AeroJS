/**
 * @file config.ts
 * @description Typed configuration store supporting nested dot-notation access.
 */

export class Config {
  private values: Record<string, unknown>;

  constructor(initialValues: Record<string, unknown> = {}) {
    this.values = initialValues;
  }

  /**
   * Retrieves a configuration property using dot-notation (e.g., 'database.connection.host').
   */
  public get<T = unknown>(path: string, defaultValue?: T): T {
    const keys = path.split('.');
    let current: any = this.values;

    for (const key of keys) {
      if (current === null || typeof current !== 'object' || !(key in current)) {
        return defaultValue as T;
      }
      current = current[key];
    }

    return (current !== undefined ? current : defaultValue) as T;
  }

  /**
   * Sets a configuration value using dot-notation.
   */
  public set(path: string, value: unknown): void {
    const keys = path.split('.');
    let current: any = this.values;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!;
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1]!;
    current[lastKey] = value;
  }

  /**
   * Checks whether a configuration key exists.
   */
  public has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  /**
   * Returns a copy of the entire configuration tree.
   */
  public all(): Record<string, unknown> {
    return { ...this.values };
  }
}
