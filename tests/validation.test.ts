import { describe, it, expect } from 'vitest';
import { Aero } from '../src/index.js';
import { validateSchema } from '../src/validation/schema.js';

describe('Schema Validation', () => {
  it('validates primitive types, formats, and ranges directly', () => {
    const schema = {
      type: 'object',
      required: ['name', 'email', 'age'],
      properties: {
        name: { type: 'string', minLength: 3 },
        email: { type: 'string', format: 'email' },
        age: { type: 'number', minimum: 18 },
      },
    };

    // Valid data
    expect(validateSchema(schema, { name: 'Bob', email: 'bob@example.com', age: 25 })).toEqual([]);

    // Invalid email
    const errEmail = validateSchema(schema, { name: 'Bob', email: 'not-an-email', age: 25 });
    expect(errEmail.length).toBeGreaterThan(0);
    expect(errEmail[0]?.keyword).toBe('format');

    // Invalid age (below minimum)
    const errAge = validateSchema(schema, { name: 'Bob', email: 'bob@example.com', age: 15 });
    expect(errAge.length).toBeGreaterThan(0);
    expect(errAge[0]?.keyword).toBe('minimum');

    // Missing required field
    const errReq = validateSchema(schema, { email: 'bob@example.com', age: 25 });
    expect(errReq.length).toBeGreaterThan(0);
    expect(errReq[0]?.keyword).toBe('required');
  });

  it('enforces route validation on body, params, and returns HTTP 400', async () => {
    const app = new Aero();

    app.routeWithSchema(
      'POST',
      '/users/:id',
      {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', minLength: 3 },
          },
        },
        body: {
          type: 'object',
          required: ['username'],
          properties: {
            username: { type: 'string', minLength: 2 },
          },
        },
      },
      (ctx) => {
        ctx.status(201).json({ created: true, body: ctx.body });
      }
    );

    const server = await app.listenAsync(0, '127.0.0.1');
    const addr = server.address() as any;
    const base = `http://127.0.0.1:${addr.port}`;

    try {
      // 1. Valid request
      const validRes = await fetch(`${base}/users/user-123`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Alice' }),
      });
      expect(validRes.status).toBe(201);
      const validBody = await validRes.json();
      expect(validBody.created).toBe(true);

      // 2. Invalid param (too short)
      const invalidParamRes = await fetch(`${base}/users/u`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Alice' }),
      });
      expect(invalidParamRes.status).toBe(400);
      const invalidParamBody = await invalidParamRes.json();
      expect(invalidParamBody.error.code).toBe('VALIDATION_ERROR');

      // 3. Invalid body (missing required username)
      const invalidBodyRes = await fetch(`${base}/users/user-123`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ other: 123 }),
      });
      expect(invalidBodyRes.status).toBe(400);
      const invalidBody = await invalidBodyRes.json();
      expect(invalidBody.error.code).toBe('VALIDATION_ERROR');
    } finally {
      await app.close();
    }
  });
});
