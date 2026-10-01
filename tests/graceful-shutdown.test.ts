import { describe, it, expect, vi } from 'vitest';
import { AeroJS } from '../src/index.js';

describe('Graceful Shutdown', () => {
  it('should register SIGTERM and SIGINT listeners and call close', async () => {
    const app = new AeroJS();
    const originalProcessOn = process.on;
    const originalProcessExit = process.exit;
    const processOnMock = vi.fn();
    const processExitMock = vi.fn();

    process.on = processOnMock as any;
    process.exit = processExitMock as any;

    app.enableGracefulShutdown();

    expect(processOnMock).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(processOnMock).toHaveBeenCalledWith('SIGINT', expect.any(Function));

    // Simulate signal handler
    const handler = processOnMock.mock.calls.find(c => c[0] === 'SIGINT')?.[1];
    expect(handler).toBeDefined();

    let closeCalled = false;
    app.close = async () => {
      closeCalled = true;
    };

    await handler();

    expect(closeCalled).toBe(true);
    expect(processExitMock).toHaveBeenCalledWith(0);

    process.on = originalProcessOn;
    process.exit = originalProcessExit;
  });
});
