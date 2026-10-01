import { describe, it, expect } from 'vitest';
import { AeroJS } from '../src/index.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Request ID', () => {
  it('should generate x-request-id if not provided', async () => {
    const app = new AeroJS();
    app.get('/', (ctx) => {
      ctx.json({ id: ctx.req.id });
    });

    const client = createTestClient(app);
    const res = await client.get('/');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.json().id).toBe(res.headers['x-request-id']);
  });

  it('should use provided x-request-id', async () => {
    const app = new AeroJS();
    app.get('/', (ctx) => {
      ctx.json({ id: ctx.req.id });
    });

    const client = createTestClient(app);
    const res = await client.get('/', {
      headers: {
        'x-request-id': 'custom-id-123'
      }
    });

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('custom-id-123');
    expect(res.json().id).toBe('custom-id-123');
  });
});
