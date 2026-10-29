import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import http from 'node:http';
import { Webhook } from '../src/webhook/webhook.js';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('Webhook Engine (Inbound Verification & Outbound Dispatch)', () => {
  const secret = 'webhook-hmac-secret-123456';
  let server: http.Server;
  let serverPort = 0;
  const receivedRequests: any[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({
          method: req.method,
          headers: req.headers,
          body,
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ received: true }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('verifies valid HMAC-SHA256 signatures and rejects forged payloads', () => {
    const payload = JSON.stringify({ event: 'payment.success', amount: 5000 });
    const signature = Webhook.sign(payload, secret);

    expect(Webhook.verifySignature(payload, signature, secret)).toBe(true);

    // Tampered payload
    const tamperedPayload = JSON.stringify({ event: 'payment.success', amount: 10000 });
    expect(Webhook.verifySignature(tamperedPayload, signature, secret)).toBe(false);

    // Wrong secret
    expect(Webhook.verifySignature(payload, signature, 'wrong-secret')).toBe(false);
  });

  it('protects endpoints via Webhook.verify middleware', async () => {
    const app = new Aero();
    app.post('/webhooks/payment', Webhook.verify(secret), (ctx) => {
      ctx.json({ ok: true });
    });

    const client = createTestClient(app);
    const body = JSON.stringify({ event: 'invoice.paid', id: 'inv_99' });
    const signature = Webhook.sign(body, secret);

    // Missing signature -> 401
    const unauth = await client.post('/webhooks/payment', {
      body,
      headers: { 'content-type': 'application/json' },
    });
    expect(unauth.status).toBe(401);

    // Invalid signature -> 401
    const invalid = await client.post('/webhooks/payment', {
      body,
      headers: {
        'content-type': 'application/json',
        'x-aero-signature': 'sha256=invalid-signature',
      },
    });
    expect(invalid.status).toBe(401);

    // Valid signature -> 200
    const valid = await client.post('/webhooks/payment', {
      body,
      headers: {
        'content-type': 'application/json',
        'x-aero-signature': `sha256=${signature}`,
      },
    });
    expect(valid.status).toBe(200);
    expect(valid.json().ok).toBe(true);
  });

  it('dispatches outbound webhooks with HMAC signatures and auto-retries', async () => {
    const url = `http://127.0.0.1:${serverPort}/webhook-target`;
    const payload = { event: 'order.shipped', orderId: 884 };

    const result = await Webhook.dispatch(url, payload, {
      secret,
      retries: 2,
      timeout: 3000,
      headers: { 'X-Custom-Source': 'AeroJS-Billing' },
    });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(1);

    expect(receivedRequests.length).toBeGreaterThan(0);
    const last = receivedRequests[receivedRequests.length - 1];
    expect(last.headers['x-custom-source']).toBe('AeroJS-Billing');
    expect(last.headers['x-aero-signature']).toBeDefined();
    expect(last.headers['x-aero-signature']).toContain('sha256=');
  });
});

