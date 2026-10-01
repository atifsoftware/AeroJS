import { describe, it, expect } from 'vitest';
import { AeroJS } from '../src/index.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Health Check', () => {
  it('should respond to /health when enableHealthCheck is called', async () => {
    const app = new AeroJS();
    app.enableHealthCheck();

    const client = createTestClient(app);
    const res = await client.get('/health');

    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('should respond to custom path when enableHealthCheck is called with arg', async () => {
    const app = new AeroJS();
    app.enableHealthCheck('/api/health');

    const client = createTestClient(app);
    const res = await client.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
