/**
 * @file 04-validation.ts
 * @description Aero JSON Schema validation example validating body, query, and params.
 */

import { Aero } from '../src/index.js';

const app = new Aero({ debug: true });

app.routeWithSchema(
  'POST',
  '/users/:id',
  {
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 2 },
      },
    },
    body: {
      type: 'object',
      required: ['name', 'email', 'age'],
      properties: {
        name: { type: 'string', minLength: 2 },
        email: { type: 'string', format: 'email' },
        age: { type: 'number', minimum: 18 },
      },
    },
  },
  (ctx) => {
    ctx.status(201).json({
      status: 'created',
      userId: ctx.params.id,
      data: ctx.body,
    });
  }
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Aero 04-validation listening on http://localhost:${PORT}`);
});
