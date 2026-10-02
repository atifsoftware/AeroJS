import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'node:http';
import { Http, HttpResponse, HttpClientError } from '../src/http/index.js';

describe('AeroJS Fluent HTTP Client', () => {
  let server: http.Server;
  let serverUrl: string;
  let lastServerRequest: { method?: string; url?: string; headers?: http.IncomingHttpHeaders; body?: string } = {};

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        lastServerRequest = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        };

        if (req.url?.startsWith('/json-echo')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ echo: body ? JSON.parse(body) : null, query: req.url }));
        } else if (req.url === '/unauthorized') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized access' }));
        } else if (req.url === '/server-error') {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Hello from Aero HTTP');
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    Http.reset();
  });

  it('performs live GET request with query params and parses text', async () => {
    const res = await Http.baseUrl(serverUrl)
      .withQuery({ search: 'aero', page: 2 })
      .get('/json-echo');

    expect(res.ok).toBe(true);
    expect(res.successful).toBe(true);
    expect(res.status).toBe(200);

    const json = res.json();
    expect(json.query).toContain('search=aero');
    expect(json.query).toContain('page=2');
  });

  it('performs live POST request with Bearer token, custom headers, and JSON body', async () => {
    const payload = { title: 'Test Order', amount: 1500 };
    const res = await Http.baseUrl(serverUrl)
      .withToken('secret-api-token-xyz')
      .withHeaders({ 'X-Custom-Tenant': 'tenant-dhaka' })
      .post('/json-echo', payload);

    expect(res.ok).toBe(true);
    expect(lastServerRequest.headers?.['authorization']).toBe('Bearer secret-api-token-xyz');
    expect(lastServerRequest.headers?.['x-custom-tenant']).toBe('tenant-dhaka');
    expect(lastServerRequest.headers?.['content-type']).toContain('application/json');

    const data = res.json();
    expect(data.echo).toEqual(payload);
  });

  it('handles client errors (401) and throws HttpClientError via .throw()', async () => {
    const res = await Http.get(`${serverUrl}/unauthorized`);

    expect(res.status).toBe(401);
    expect(res.clientError).toBe(true);
    expect(res.serverError).toBe(false);
    expect(res.failed).toBe(true);

    expect(() => res.throw()).toThrow(HttpClientError);
  });

  it('throws error when status code does not match .throwUnlessStatus()', async () => {
    const res = await Http.get(`${serverUrl}/json-echo`);
    expect(() => res.throwUnlessStatus(201)).toThrow(HttpClientError);
  });

  it('supports testing fakes using Http.fake() and assertions with Http.assertSent()', async () => {
    Http.fake({
      '/api/v1/users': { id: 1, name: 'John Doe', status: 'Active' },
      '/api/v1/billing': Http.response({ invoiceId: 'INV-550' }, 201),
    });

    const userRes = await Http.get('https://external-api.org/api/v1/users');
    expect(userRes.ok).toBe(true);
    expect(userRes.json().name).toBe('John Doe');

    const billingRes = await Http.post('https://external-api.org/api/v1/billing', { total: 500 });
    expect(billingRes.status).toBe(201);
    expect(billingRes.json().invoiceId).toBe('INV-550');

    Http.assertSent((req) => req.url.includes('/api/v1/users') && req.method === 'GET');
    Http.assertSent((req) => req.url.includes('/api/v1/billing') && req.method === 'POST');
    Http.assertNotSent((req) => req.url.includes('/api/v1/unknown'));
  });

  it('supports Basic Auth encoding', async () => {
    Http.fake(() => Http.response({ authOk: true }));

    await Http.withBasicAuth('admin', 'p@ssword123').get('https://example.com/secure');

    Http.assertSent((req) => {
      const authHeader = req.headers['Authorization'];
      const expected = `Basic ${Buffer.from('admin:p@ssword123').toString('base64')}`;
      return authHeader === expected;
    });
  });
});
