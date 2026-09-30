import { describe, it, expect } from 'vitest';
import { Container } from '../src/di/container.js';
import { inject } from '../src/di/inject.js';

describe('IoC Container', () => {
  it('registers and resolves transient bindings', () => {
    const container = new Container();
    let count = 0;
    container.bind('counter', () => ++count);

    expect(container.resolve('counter')).toBe(1);
    expect(container.resolve('counter')).toBe(2);
  });

  it('registers and resolves singleton bindings', () => {
    const container = new Container();
    let count = 0;
    container.singleton('counter', () => ++count);

    expect(container.resolve('counter')).toBe(1);
    expect(container.resolve('counter')).toBe(1);
  });

  it('registers and resolves direct instances', () => {
    const container = new Container();
    const config = { host: 'localhost', port: 5432 };
    container.instance('config', config);

    expect(container.resolve('config')).toBe(config);
    expect(container.has('config')).toBe(true);
    expect(container.has('nonexistent')).toBe(false);
  });

  it('throws error when resolving unregistered service', () => {
    const container = new Container();
    expect(() => container.resolve('missing')).toThrow("Cannot resolve service 'missing'");
  });

  it('instantiates and auto-wires classes via container.make()', () => {
    const container = new Container();
    container.instance('apiKey', 'secret-1234');

    class Client {
      @inject('apiKey')
      public key!: string;
    }

    const client = container.make(Client);
    expect(client.key).toBe('secret-1234');
  });
});
