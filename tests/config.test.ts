import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Config, env, Env, Aero } from '../src/index.js';

describe('Config Store', () => {
  it('should initialize with values and retrieve them via dot notation', () => {
    const config = new Config({
      app: {
        name: 'AeroApp',
        server: {
          port: 3000,
          host: '127.0.0.1',
        },
      },
    });

    expect(config.get('app.name')).toBe('AeroApp');
    expect(config.get('app.server.port')).toBe(3000);
    expect(config.get('app.server.host')).toBe('127.0.0.1');
    expect(config.get('app.server.ssl', false)).toBe(false);
    expect(config.get('nonexistent.path')).toBeUndefined();
    expect(config.get('nonexistent.path', 'fallback')).toBe('fallback');
  });

  it('should set nested properties via dot notation', () => {
    const config = new Config();
    config.set('database.connection.host', 'localhost');
    config.set('database.connection.port', 5432);

    expect(config.get('database.connection.host')).toBe('localhost');
    expect(config.get('database.connection.port')).toBe(5432);
    expect(config.has('database.connection.host')).toBe(true);
    expect(config.has('database.connection.user')).toBe(false);

    const all = config.all();
    expect(all).toEqual({
      database: {
        connection: {
          host: 'localhost',
          port: 5432,
        },
      },
    });
  });

  it('should be integrated directly into Aero application instance', () => {
    const app = new Aero();
    app.config.set('services.redis.host', 'cache.local');

    expect(app.config.get('services.redis.host')).toBe('cache.local');
  });
});

describe('Env Validator & Loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should read string, number, and boolean environment variables', () => {
    process.env.TEST_APP_NAME = 'AeroAPI';
    process.env.TEST_PORT = '8080';
    process.env.TEST_ENABLE_LOGS = 'true';
    process.env.TEST_DEBUG_FLAG = '1';

    const envInstance = new Env();
    expect(envInstance.get('TEST_APP_NAME')).toBe('AeroAPI');
    expect(envInstance.get('TEST_MISSING', 'default-val')).toBe('default-val');

    expect(envInstance.getNumber('TEST_PORT')).toBe(8080);
    expect(envInstance.getNumber('TEST_MISSING_PORT', 3000)).toBe(3000);

    expect(envInstance.getBoolean('TEST_ENABLE_LOGS')).toBe(true);
    expect(envInstance.getBoolean('TEST_DEBUG_FLAG')).toBe(true);
    expect(envInstance.getBoolean('TEST_MISSING_FLAG', false)).toBe(false);
  });

  it('should require environment variables or throw', () => {
    process.env.REQUIRED_VAR = 'present';
    const envInstance = new Env();

    expect(envInstance.require('REQUIRED_VAR')).toBe('present');
    expect(() => envInstance.require('MISSING_VAR')).toThrow(/required/);
  });

  it('should validate schemas and apply types and defaults', () => {
    process.env.DB_HOST = 'db.internal';
    process.env.DB_PORT = '5432';
    process.env.DB_SSL = 'yes';

    const validated = env.validate({
      DB_HOST: { type: 'string', required: true },
      DB_PORT: { type: 'number', required: true },
      DB_SSL: { type: 'boolean', default: false },
      DB_POOL_MIN: { type: 'number', default: 2 },
    });

    expect(validated).toEqual({
      DB_HOST: 'db.internal',
      DB_PORT: 5432,
      DB_SSL: true,
      DB_POOL_MIN: 2,
    });
  });

  it('should throw on missing required env or invalid number', () => {
    delete process.env.MISSING_KEY;
    expect(() => {
      env.validate({
        MISSING_KEY: { required: true },
      });
    }).toThrow(/Required environment variable 'MISSING_KEY' is missing/);

    process.env.INVALID_NUM = 'not-a-number';
    expect(() => {
      env.validate({
        INVALID_NUM: { type: 'number' },
      });
    }).toThrow(/must be a number/);
  });
});
