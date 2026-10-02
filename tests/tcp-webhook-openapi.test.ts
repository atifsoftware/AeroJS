import { describe, it, expect } from 'vitest';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';
import { MLLP, HL7 } from '../src/tcp/index.js';
import { Webhook } from '../src/webhook/index.js';

describe('Integration & Protocol Modules: TCP/MLLP Gateway, Webhooks, OpenAPI 3.1', () => {
  describe('TCP / Raw Socket Gateway & MLLP/HL7 Parser', () => {
    it('wraps, unwraps, and generates MLLP ACK envelopes', () => {
      const msg = 'MSH|^~\\&|SYS1|LAB|AERO|HOSP|20261002060000||ORU^R01|MSG1001|P|2.3.1\rPID|||UHID-4021||Rahim^Uddin\r';
      const framed = MLLP.wrap(msg);

      expect(framed[0]).toBe(0x0b);
      expect(framed[framed.length - 2]).toBe(0x1c);
      expect(framed[framed.length - 1]).toBe(0x0d);

      const unwrapped = MLLP.unwrap(framed);
      expect(unwrapped).toBe(msg);

      const ackBuf = MLLP.ack('MSG1001');
      const ackStr = MLLP.unwrap(ackBuf);
      expect(ackStr).toContain('MSA|AA|MSG1001');
    });

    it('parses structured HL7 messages into segments and control IDs', () => {
      const raw = 'MSH|^~\\&|SYSMEX_XN|HEMATOLOGY|AERO_GATEWAY|CORE_LAB|20261002061500||ORU^R01|CTRL-992|P|2.3.1\rPID|1||UHID-8801||Karim^Hasan\rOBX|1|NM|CBC_WBC||7.5|10*3/uL|4.0-11.0|N|F\r';
      const parsed = HL7.parse(raw);

      expect(parsed.sendingApp).toBe('SYSMEX_XN');
      expect(parsed.messageType).toBe('ORU^R01');
      expect(parsed.controlId).toBe('CTRL-992');
      expect(parsed.segments.has('PID')).toBe(true);
      expect(parsed.segments.has('OBX')).toBe(true);

      const obx = parsed.getSegment('OBX')!;
      expect(obx[2]).toBe('CBC_WBC');
      expect(obx[4]).toBe('7.5');
    });

    it('communicates over raw TCP using app.tcp gateway', async () => {
      const app = new Aero();
      const port = 12575;
      const tcpServer = app.tcp({ port });

      tcpServer.on('data', (socket, buffer) => {
        const unwrapped = MLLP.unwrap(buffer);
        const parsed = HL7.parse(unwrapped);
        const ack = MLLP.ack(parsed.controlId);
        socket.write(ack);
      });

      await tcpServer.listen();

      const receivedAck = await new Promise<string>((resolve, reject) => {
        const client = net.createConnection({ port }, () => {
          const testMsg = 'MSH|^~\\&|MINDRAY|LAB|AERO|HOSP|20261002||ORU^R01|TEST-42|P|2.3.1\r';
          client.write(MLLP.wrap(testMsg));
        });

        client.on('data', (data) => {
          const text = MLLP.unwrap(data);
          client.end();
          resolve(text);
        });

        client.on('error', reject);
      });

      await tcpServer.close();
      expect(receivedAck).toContain('MSA|AA|TEST-42');
    });
  });

  describe('Webhook Engine (Inbound Verification & Outbound Dispatch)', () => {
    it('verifies valid inbound HMAC-SHA256 signature and rejects forged calls', async () => {
      const app = new Aero();
      const secret = 'super-secret-bkash-key';

      app.post('/webhook/payment', Webhook.verify(secret), (ctx) => {
        ctx.status(200).json({ status: 'payment_verified', orderId: ctx.body.orderId });
      });

      const client = createTestClient(app);
      const payload = { orderId: 'ORD-2026-99', amount: 1500 };

      // Compute valid signature
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(JSON.stringify(payload));
      const validSig = hmac.digest('hex');

      // Valid signature -> 200 OK
      const resOk = await client.post('/webhook/payment', {
        headers: { 'x-aero-signature': `sha256=${validSig}` },
        body: payload,
      });
      expect(resOk.status).toBe(200);
      expect((await resOk.json()).status).toBe('payment_verified');

      // Missing signature -> 401 Unauthorized
      const resMissing = await client.post('/webhook/payment', {
        body: payload,
      });
      expect(resMissing.status).toBe(401);

      // Tampered signature -> 401 Unauthorized
      const resTampered = await client.post('/webhook/payment', {
        headers: { 'x-aero-signature': 'sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb' },
        body: payload,
      });
      expect(resTampered.status).toBe(401);
    });

    it('dispatches outbound webhook with HMAC-SHA256 and handles retries', async () => {
      const secret = 'outbound-insurance-secret';
      let receivedSignature = '';
      let receivedPayload: any = null;

      // Spin up temporary HTTP receiver
      const receiver = http.createServer((req, res) => {
        receivedSignature = req.headers['x-aero-signature'] as string;
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          receivedPayload = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        });
      });

      await new Promise<void>((resolve) => receiver.listen(18899, resolve));

      const payload = { event: 'patient.discharged', uhid: 'UHID-2026-001' };
      const result = await Webhook.dispatch('http://127.0.0.1:18899/webhook', payload, {
        secret,
        retries: 2,
      });

      await new Promise<void>((resolve) => receiver.close(() => resolve()));

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attempts).toBe(1);
      expect(receivedPayload).toEqual(payload);

      // Verify signature received by mock server
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(JSON.stringify(payload));
      const expectedSig = `sha256=${hmac.digest('hex')}`;
      expect(receivedSignature).toBe(expectedSig);
    });
  });

  describe('OpenAPI 3.1 Auto-Generator & Route Metadata', () => {
    it('generates OpenAPI 3.1.0 JSON with chained .openapi() metadata', async () => {
      const app = new Aero();

      app.get('/patients/:id', (ctx) => {
        ctx.status(200).json({ id: ctx.req.params.id });
      })
        .schema({
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        })
        .openapi({
          summary: 'Retrieve Patient by UHID',
          description: 'Fetches permanent lifetime electronic medical record.',
          tags: ['Patient MPI'],
          responses: {
            '200': { description: 'Patient profile record found' },
            '404': { description: 'Patient not found' },
          },
        });

      app.useOpenApi({
        title: 'Hospital Core EMR API',
        version: '3.1.0',
        specRoute: '/api-spec.json',
        route: '/api-docs',
      });

      const client = createTestClient(app);

      // Test spec endpoint
      const specRes = await client.get('/api-spec.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();

      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info.title).toBe('Hospital Core EMR API');
      expect(spec.paths['/patients/{id}']).toBeDefined();

      const getOp = spec.paths['/patients/{id}'].get;
      expect(getOp.summary).toBe('Retrieve Patient by UHID');
      expect(getOp.description).toBe('Fetches permanent lifetime electronic medical record.');
      expect(getOp.tags).toContain('Patient MPI');
      expect(getOp.responses['404']).toBeDefined();

      // Test Swagger UI endpoint
      const docsRes = await client.get('/api-docs');
      expect(docsRes.status).toBe(200);
      expect(docsRes.headers['content-type']).toContain('text/html');
      const html = await docsRes.text();
      expect(html).toContain('Hospital Core EMR API');
      expect(html).toContain('swagger-ui');
    });
  });
});
