import { describe, it, expect } from 'vitest';
import { Aero, ServiceProvider } from '../src/index.js';

describe('Service Providers Lifecycle', () => {
  it('executes register, boot, ready in order and shutdown in reverse order', async () => {
    const lifecycleLog: string[] = [];

    class ProviderA extends ServiceProvider {
      override register() {
        lifecycleLog.push('A:register');
        this.app.container.instance('serviceA', 'A');
      }
      override boot() {
        lifecycleLog.push('A:boot');
      }
      override ready() {
        lifecycleLog.push('A:ready');
      }
      override shutdown() {
        lifecycleLog.push('A:shutdown');
      }
    }

    class ProviderB extends ServiceProvider {
      override register() {
        lifecycleLog.push('B:register');
        this.app.container.instance('serviceB', 'B');
      }
      override boot() {
        lifecycleLog.push('B:boot');
      }
      override ready() {
        lifecycleLog.push('B:ready');
      }
      override shutdown() {
        lifecycleLog.push('B:shutdown');
      }
    }

    const app = new Aero();
    app.register(ProviderA);
    app.register(ProviderB);

    await app.listenAsync(0, '127.0.0.1');

    expect(lifecycleLog).toEqual([
      'A:register',
      'B:register',
      'A:boot',
      'B:boot',
      'A:ready',
      'B:ready',
    ]);

    expect(app.container.resolve('serviceA')).toBe('A');
    expect(app.container.resolve('serviceB')).toBe('B');

    await app.close();

    // Reverse order shutdown
    expect(lifecycleLog).toEqual([
      'A:register',
      'B:register',
      'A:boot',
      'B:boot',
      'A:ready',
      'B:ready',
      'B:shutdown',
      'A:shutdown',
    ]);
  });
});
