import { describe, it, expect, vi } from 'vitest';
import { AeroJS } from '../src/index.js';
import { Logger } from '../src/logging/logger.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Context Logger', () => {
  it('should expose structured logging interface on ctx.log and proxy to Logger', async () => {
    const infoSpy = vi.spyOn(Logger, 'info').mockImplementation(() => {});

    const app = new AeroJS();
    app.get('/log-test', (ctx) => {
      ctx.log.info('Test log entry', { userId: 42 });
      ctx.json({ ok: true });
    });

    const client = createTestClient(app);
    await client.get('/log-test');

    expect(infoSpy).toHaveBeenCalledWith('Test log entry', { userId: 42 });

    infoSpy.mockRestore();
  });
});
