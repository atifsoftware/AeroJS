# AeroJS AI Agent Architecture & Coding Guidelines

> **Notice for AI Coding Assistants (Gemini, Claude, Cursor, Windsurf, Copilot, ChatGPT):**
> This file is your canonical reference manual for writing correct, idiomatic, high-performance TypeScript code for applications built on **AeroJS**. Always adhere strictly to the conventions, patterns, and APIs documented here.

---

## 1. Framework Philosophy & Core Concepts

- **Framework Name**: **AeroJS** (imported as `from 'aerojs'`)
- **Package Identity**: `@aerojs` or `aerojs`
- **Architecture**: Modern, layered Full-Stack MVC & Service-Oriented Architecture.
- **Runtime**: Node.js (ESM modules, `"type": "module"`).
- **Core Standard**: Zero external runtime dependencies in core engine. High-throughput HTTP routing, built-in Active Record ORM, DI container, and flexible view/frontend drivers.

### Layered Architecture Flow
```
Incoming HTTP Request
        │
   [Middleware] (CORS, Security Headers, CSRF, Rate Limiting, Auth)
        │
   [Router] (Matches Path & HTTP Verb)
        │
   [Validator] (Validates request schema / payload before handler)
        │
   [Controller] (Extracts request inputs, calls Service layer)
        │
   [Service Layer] (Business logic, transactions, external APIs)
        │
   [Active Record Model / QueryBuilder / Database]
        │
   [Response / View Engine / Inertia.js]
```

---

## 2. Directory Structure & Responsibilities

| Path | Responsibility | Permitted Imports & Logic |
| :--- | :--- | :--- |
| `app/controllers/` | HTTP handling, status codes, delegating to services | Models, Services, Validators, `AeroContext` |
| `app/services/` | Reusable business logic, multi-model transactions | Models, `DB`, External APIs, Jobs, Mail |
| `app/models/` | Active Record entity definitions, relationships, hooks | `Model`, `Relation` from `aerojs` |
| `app/validators/` | Request schemas (JSON Schema / VineJS) | Schema validation utilities |
| `app/middleware/` | Request interception, authentication, logging | `AeroContext`, `NextFunction` from `aerojs` |
| `app/jobs/` | Asynchronous background tasks | `Job` from `aerojs` |
| `config/` | Application configuration modules | Reads `process.env` |
| `database/migrations/` | Database table creation & schema evolution | `Schema`, `TableBlueprint`, `Migration` from `aerojs` |
| `routes/` | Route definitions (`api.ts`, `web.ts`) | Controllers, Middlewares, Validators |
| `public/` | Public static assets (CSS, JS, images, robots.txt) | Static files only |
| `storage/` | Runtime logs, uploaded files, cache | Disk I/O |
| `tests/` | In-process integration & unit tests | `createTestClient`, `vitest` |

---

## 3. Routing & Controllers

### 3.1 Defining Routes (`routes/api.ts` & `routes/web.ts`)

Always group related routes and use **Controller Tuples** `[ControllerClass, 'methodName']`:

```typescript
import type { Router } from 'aerojs';
import { UserController } from '../app/controllers/UserController.js';
import { authMiddleware } from '../app/middleware/AuthMiddleware.js';
import { createUserSchema } from '../app/validators/UserValidator.js';

export function registerApiRoutes(router: Router): void {
  router.group('/api/v1', (api) => {
    // Public routes
    api.get('/health', async (ctx) => {
      ctx.json({ status: 'ok', uptime: process.uptime() });
    });

    // Resource routes
    api.group('/users', (users) => {
      users.get('/', [UserController, 'index']);
      users.get('/:id', [UserController, 'show']);
      users.post('/', [UserController, 'store']).schema(createUserSchema);
      users.put('/:id', [UserController, 'update']).middleware(authMiddleware);
      users.delete('/:id', [UserController, 'destroy']).middleware(authMiddleware);
    });
  });
}
```

### 3.2 Writing Controllers (`app/controllers/`)

Controllers must remain thin. Never write SQL queries or heavy business logic directly inside controllers; call the **Service Layer**:

```typescript
import type { AeroContext } from 'aerojs';
import { UserService } from '../services/UserService.js';

export class UserController {
  private userService = new UserService();

  public async index(ctx: AeroContext): Promise<void> {
    const page = parseInt((ctx.req.query.page as string) || '1', 10);
    const users = await this.userService.paginate(page);
    ctx.status(200).json({ success: true, data: users });
  }

  public async show(ctx: AeroContext): Promise<void> {
    const id = ctx.req.params.id;
    const user = await this.userService.findById(id);
    if (!user) {
      ctx.status(404).json({ error: 'User not found' });
      return;
    }
    ctx.status(200).json({ success: true, data: user });
  }

  public async store(ctx: AeroContext): Promise<void> {
    const payload = ctx.body as any;
    const newUser = await this.userService.create(payload);
    ctx.status(201).json({ success: true, data: newUser });
  }
}
```

### 3.3 AeroContext Cheatsheet

```typescript
// Reading Inputs
const id = ctx.req.params.id;              // Route parameters: /users/:id
const search = ctx.req.query.q;            // Query string: ?q=term
const body = ctx.body;                     // Parsed JSON or UrlEncoded body
const auth = ctx.req.get('authorization'); // Request headers
const cookie = ctx.cookies.get('token');   // Read cookies

// Sending Responses
ctx.status(200).json({ key: 'val' });      // JSON response
ctx.html('<h1>Hello World</h1>');           // HTML response
ctx.text('Plain text message');            // Plain text
ctx.redirect('/dashboard', 302);           // Redirect
ctx.cookies.set('token', 'xyz', {          // Set cookie
  httpOnly: true,
  secure: true,
  maxAge: 3600,
});
```

---

## 4. Database, Active Record ORM & Migrations

AeroJS features a first-class, built-in ORM with Active Record models, fluent QueryBuilder, and schema migrations.

### 4.1 Active Record Models (`app/models/`)

Define models by extending `Model`:

```typescript
import { Model } from 'aerojs';
import { Post } from './Post.js';
import { Profile } from './Profile.js';

export class User extends Model {
  public static override table = 'users';
  public static override primaryKey = 'id';
  public static override fillable = ['name', 'email', 'role', 'password'];
  public static override hidden = ['password'];
  public static override softDeletes = true; // Enables deleted_at handling

  // Relationships
  public profile() {
    return this.hasOne(Profile, 'user_id');
  }

  public posts() {
    return this.hasMany(Post, 'user_id');
  }
}
```

#### Model Query & Persistence Operations

```typescript
// Finding Records
const user = await User.find(1);
const user = await User.findOrFail(1); // Throws NotFoundError if missing
const admin = await User.where('role', 'admin').first();
const allActive = await User.where('is_active', true).get();

// Eager Loading Relationships
const usersWithPosts = await User.with('profile', 'posts').get();

// Creating Records
const newUser = await User.create({
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'developer',
});

// Updating Records
user.name = 'Jane Smith';
await user.save();

// Deleting Records
await user.delete();   // Soft deletes if softDeletes = true
await user.restore();  // Restores soft-deleted record
```

### 4.2 Fluent QueryBuilder (`DB.table(...)`)

When complex aggregate queries, custom joins, or bulk operations are needed:

```typescript
import { DB } from 'aerojs';

// Select with conditions, joins & pagination
const results = await DB.table('orders')
  .select('orders.*', 'users.name as customer_name')
  .join('users', 'orders.user_id', 'users.id')
  .where('orders.status', '=', 'completed')
  .whereIn('orders.currency', ['USD', 'EUR'])
  .orderBy('orders.created_at', 'DESC')
  .paginate(1, 15); // Returns { data, total, page, perPage, lastPage }

// Aggregates
const totalRevenue = await DB.table('orders').sum('total_amount');
const orderCount = await DB.table('orders').where('status', 'pending').count();

// Direct Insert, Update, Delete
await DB.table('logs').insert({ event: 'login', ip: '127.0.0.1' });
await DB.table('users').where('id', 5).update({ status: 'active' });
await DB.table('sessions').where('expires_at', '<', new Date()).delete();

// Raw SQL & Transactions
const rawRows = await DB.query('SELECT * FROM users WHERE email = ?', ['admin@dev.com']);

await DB.transaction(async (trx) => {
  await trx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]);
  await trx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2]);
});
```

### 4.3 Database Migrations (`database/migrations/`)

Migrations define schema changes using `TableBlueprint`:

```typescript
import { Schema, type Migration, type TableBlueprint } from 'aerojs';

export default class CreateUsersTable implements Migration {
  public name = '2026_09_30_000000_create_users_table';

  public async up(): Promise<void> {
    await Schema.create('users', (table: TableBlueprint) => {
      table.increments('id');
      table.string('name', 255).notNull();
      table.string('email', 191).notNull().unique();
      table.string('role').defaultTo('user');
      table.boolean('is_active').defaultTo(true);
      table.text('bio').nullable();
      table.timestamps(); // Creates created_at and updated_at
    });
  }

  public async down(): Promise<void> {
    await Schema.dropIfExists('users');
  }
}
```

#### Blueprint Column Methods
- `table.increments('id')`
- `table.string('name', 255)`
- `table.integer('age')`
- `table.boolean('is_verified')`
- `table.text('content')`
- `table.timestamp('published_at')`
- `table.timestamps()`
- `.nullable()`, `.notNull()`, `.unique()`, `.defaultTo(val)`

### 4.4 Database Adapters, Dialects & Connection Pooling

AeroJS supports multiple relational databases via Knex connection pooling, as well as native zero-dependency in-memory execution.

#### Environment Variables (`.env`):
```env
# Database (MySQL / PostgreSQL / SQLite)
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_DATABASE=aerojs_app
DB_POOL_MIN=2
DB_POOL_MAX=20
```

#### How Dialects & Pooling Work in `config/database.ts`:
```typescript
const poolMin = parseInt(process.env.DB_POOL_MIN || '2', 10);
const poolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);

export const databaseConfig = {
  default: (process.env.DB_CONNECTION || 'mysql').toLowerCase(),
  pool: { min: poolMin, max: poolMax },
  connections: {
    mysql: { client: 'mysql2', ... },
    postgres: { client: 'pg', ... },
    sqlite: { client: 'better-sqlite3', ... },
    memory: { client: 'memory' },
  }
};
```

#### 1. Using MySQL (`client: 'mysql2'`)
```typescript
import knex from 'knex';
import { useKnex } from 'aerojs';
import { databaseConfig } from './config/database.js';

const db = knex({
  client: 'mysql2',
  connection: databaseConfig.connections.mysql,
  pool: databaseConfig.pool,
});
useKnex(db); // Seamlessly binds to all Models and DB.table()
```

#### 2. Using PostgreSQL (`client: 'pg'`)
Change `.env` to `DB_CONNECTION=postgres`, `DB_PORT=5432`, `DB_USER=postgres`:
```typescript
import knex from 'knex';
import { useKnex } from 'aerojs';
import { databaseConfig } from './config/database.js';

const db = knex({
  client: 'pg',
  connection: databaseConfig.connections.postgres,
  pool: databaseConfig.pool,
});
useKnex(db);
```

#### 3. Using SQLite (`client: 'better-sqlite3'`)
Change `.env` to `DB_CONNECTION=sqlite`, `DB_DATABASE=storage/database.sqlite`:
```typescript
import knex from 'knex';
import { useKnex } from 'aerojs';
import { databaseConfig } from './config/database.js';

const db = knex({
  client: 'better-sqlite3',
  connection: databaseConfig.connections.sqlite,
  useNullAsDefault: true,
});
useKnex(db);
```

#### 4. Connecting Prisma or Drizzle
```typescript
import { usePrisma, useDrizzle } from 'aerojs';

// Prisma
usePrisma(prismaClient);

// Drizzle
useDrizzle(drizzleDb);
```

---

## 5. Frontend & View Engines (Vue, React, Edge.js, EJS)

AeroJS supports multiple presentation tiers:

### 5.1 Inertia.js (React & Vue 3)

For modern Single Page Applications with server-side routing:

1. **Enable in `server.ts`**:
   ```typescript
   app.useInertia({
     rootView: 'default', // Or custom HTML root template with vite() tags
     version: '1.0',
   });
   ```

2. **Render in Controller**:
   ```typescript
   export class UserController {
     public async index(ctx: AeroContext): Promise<void> {
       const users = await User.all();
       await ctx.inertia.render('Users/Index', {
         users,
         title: 'User Management',
       });
     }
   }
   ```

### 5.2 Official Vite Integration (`vite.config.ts` for React & Vue 3)

AeroJS integrates seamlessly with **Vite** for ultra-fast Hot Module Replacement (HMR) during development and optimized asset hashing in production.

#### 1. Directory Structure:
```text
my-aero-app/
├── resources/
│   ├── js/
│   │   └── app.ts           # Vue 3 / React entry point
│   └── css/
│       └── app.css          # Tailwind CSS / Styles
├── public/
│   └── build/               # Generated production assets & manifest.json
└── vite.config.ts           # Vite configuration
```

#### 2. `vite.config.ts` Configuration:
```typescript
import { defineConfig } from 'vite';
// For React: import react from '@vitejs/plugin-react';
// For Vue 3: import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    // react(), // or vue()
  ],
  build: {
    outDir: 'public/build',
    manifest: true, // Generates manifest.json with hashed chunks
    rollupOptions: {
      input: 'resources/js/app.ts', // or resources/js/app.tsx
    },
  },
  server: {
    cors: true,
    port: 5173,
    strictPort: true,
  },
});
```

#### 3. Injecting Vite Assets with AeroJS `vite()` Helper:
AeroJS provides a built-in `vite(entry)` helper that auto-detects development vs production:
- In Development: Injects `<script type="module" src="http://localhost:5173/@vite/client">` + entry scripts.
- In Production: Automatically reads `public/build/manifest.json` and injects hashed `<link rel="stylesheet">` and `<script>` tags.

```typescript
import { vite } from 'aerojs';

// In your root Inertia view or HTML layout:
app.useInertia({
  rootView: `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        ${vite('resources/js/app.ts')}
      </head>
      <body>
        @inertia
      </body>
    </html>
  `,
});
```

#### 4. NPM Scripts (`package.json`):
```json
{
  "scripts": {
    "dev": "concurrently \"tsx watch server.ts\" \"vite\"",
    "build": "tsc && vite build",
    "start": "node dist/server.js"
  }
}
```

### 5.3 Edge.js Template Engine (AdonisJS Style)

```typescript
import { Edge } from 'edge.js';
import { createEdgeDriver } from 'aerojs';

const edge = new Edge();
edge.mount(new URL('./views', import.meta.url));
app.useViewEngine(createEdgeDriver(edge));

// In Route / Controller:
router.get('/dashboard', async (ctx) => {
  await ctx.view('dashboard', { user: ctx.state.user });
});
```

### 5.3 EJS Template Engine

```typescript
import ejs from 'ejs';
import { createEjsDriver } from 'aerojs';

app.useViewEngine(createEjsDriver(ejs));

// In Route / Controller:
router.get('/about', async (ctx) => {
  await ctx.view('pages/about.ejs', { title: 'About Us' });
});
```

### 5.4 SSR Engine

AeroJS includes a built-in `SSREngine` supporting asynchronous streaming and string rendering for server-rendered React or Vue components.

---

## 6. Request Validation (`app/validators/`)

Always validate request payloads before they reach business logic:

```typescript
export const createUserSchema = {
  body: {
    type: 'object',
    required: ['name', 'email'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100 },
      email: { type: 'string', format: 'email' },
      role: { type: 'string', enum: ['admin', 'developer', 'user'] },
    },
  },
};
```

Attach to routes using `.schema(createUserSchema)`. AeroJS will automatically reject invalid requests with status `422 Unprocessable Entity`.

---

## 7. Background Queue Jobs & Mail

### 7.1 Jobs (`app/jobs/`)

```typescript
import { Job, Queue } from 'aerojs';

export class SendWelcomeEmailJob extends Job {
  public static override queue = 'emails';
  public static override maxTries = 3;

  public async handle(): Promise<void> {
    const { email, name } = this.data;
    console.log(`Sending welcome email to ${name} (${email})`);
  }
}

// Dispatching a Job:
await Queue.push(new SendWelcomeEmailJob({ email: 'user@aerojs.dev', name: 'User' }));
```

### 7.2 Mail Sending

```typescript
import { Mail } from 'aerojs';

await Mail.send({
  to: 'user@example.com',
  subject: 'Welcome to our platform',
  html: '<h1>Welcome!</h1><p>Your account is now ready.</p>',
});
```

---

## 8. Testing Conventions (`tests/`)

Use AeroJS `createTestClient` with Vitest for fast, in-memory end-to-end testing without opening real network sockets:

```typescript
import { describe, it, expect } from 'vitest';
import { createTestClient } from 'aerojs/testing';
import app from '../server.js';

describe('User API Tests', () => {
  const client = createTestClient(app);

  it('GET /api/users returns list of users', async () => {
    const res = await client.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.json().success).toBe(true);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('POST /api/users validates payload', async () => {
    const res = await client.post('/api/users', {
      body: { name: 'A' }, // Missing email & name too short
    });
    expect(res.status).toBe(422);
  });
});
```

### 8.2 Next.js Style Interactive Error Dashboard

In development mode (`debug: true` or `NODE_ENV !== 'production'`):
- **Browser Requests (`Accept: text/html`)**: AeroJS intercepts unhandled exceptions and renders a rich dark-mode Error Dashboard. It parses the stack trace, extracts the local source code file, and highlights the exact crashing line with an error indicator (`→`). It also provides interactive call stack inspection, request headers/parameters explorer, and system diagnostics.
- **API Requests (`Accept: application/json`)**: AeroJS returns clean JSON with `{ error: { message, status, code, stack } }`.

---

## 9. Frontend & View Engines (Edge.js, EJS, React, Vue 3)

AeroJS supports both **Server-Side Template Engines (MPA)** and **Modern Single-Page Applications (SPA)** via Inertia.js protocol.

### 9.1 Edge.js (AdonisJS Official Template Engine)
- **Install**: `npm install edge.js`
- **Location**: `views/edge/*.edge`
- **Syntax**:
  ```edge
  @each(product in products)
    <div class="product-card">
      <h3>{{ product.name }}</h3>
      <span>${{ product.price }}</span>
      @if(product.stock > 10)
        <span class="stock-ok">In Stock ({{ product.stock }})</span>
      @else
        <span class="stock-low">Low Stock ({{ product.stock }})</span>
      @endif
    </div>
  @endeach
  ```
- **Handler**:
  ```ts
  import { renderEdge } from '../app/views/engine.js';
  router.get('/views/edge', async (ctx: AeroContext) => {
    const products = await DB.table('products').get();
    const html = await renderEdge('edge/products', { products });
    ctx.html(html);
  });
  ```

### 9.2 EJS (Embedded JavaScript)
- **Install**: `npm install ejs && npm install -D @types/ejs`
- **Location**: `views/ejs/*.ejs`
- **Syntax**:
  ```ejs
  <% products.forEach(function(product) { %>
    <div class="product-card">
      <h3><%= product.name %></h3>
      <span>$<%= product.price %></span>
      <% if (product.stock > 10) { %>
        <span class="stock-ok">In Stock</span>
      <% } else { %>
        <span class="stock-low">Low Stock</span>
      <% } %>
    </div>
  <% }); %>
  ```
- **Handler**:
  ```ts
  import { renderEjs } from '../app/views/engine.js';
  router.get('/views/ejs', async (ctx: AeroContext) => {
    const products = await DB.table('products').get();
    const html = await renderEjs('ejs/products.ejs', { products });
    ctx.html(html);
  });
  ```

### 9.3 React 18 (Inertia.js SPA)
- **Install**: `@inertiajs/react react react-dom`
- **Location**: `resources/js/Pages/ProductsReact.tsx`
- **Handler**:
  ```ts
  router.get('/views/react', async (ctx: AeroContext) => {
    const products = await DB.table('products').get();
    await ctx.inertia.render('ProductsReact', { products });
  });
  ```
- **Protocol**:
  - Initial visit from browser: Returns HTML shell with `<div id="app" data-page='{"component":"ProductsReact","props":{...}}'></div>`.
  - AJAX visit with `X-Inertia: true`: Returns lightweight JSON props.

### 9.4 Vue 3 (Inertia.js SPA)
- **Install**: `@inertiajs/vue3 vue`
- **Location**: `resources/js/Pages/ProductsVue.vue`
- **Handler**:
  ```ts
  router.get('/views/vue', async (ctx: AeroContext) => {
    const products = await DB.table('products').get();
    await ctx.inertia.render('ProductsVue', { products });
  });
  ```

---

## 10. AI Agent Implementation Checklist

When asked to build or modify any feature in an AeroJS project:

1. **New Route**: Register in `routes/api.ts` or `routes/web.ts` using `router.group()` and controller tuples `[Controller, 'action']`.
2. **New Controller**: Place in `app/controllers/`. Keep it lean; forward data to `app/services/`.
3. **New Business Logic**: Place in `app/services/`.
4. **New Entity / Table**:
   - Create migration in `database/migrations/` using `Schema.create('table_name', (table) => ...)`.
   - Create model in `app/models/` extending `Model`.
5. **New Input Validation**: Create schema in `app/validators/` and attach via `.schema(...)`.
6. **Async Tasks / Emails**: Create job in `app/jobs/` extending `Job` and dispatch via `Queue.push()`.
7. **Frontend Views**:
   - Use Edge.js (`views/edge/`) or EJS (`views/ejs/`) for Server-Rendered HTML.
   - Use Inertia.js React (`resources/js/Pages/*.tsx`) or Vue 3 (`resources/js/Pages/*.vue`) for SPAs.
8. **Verification**: Always verify changes by running:
   ```bash
   npm run build
   npm test
   ```

---

## 11. Enterprise Capabilities Reference (v0.3.0)

### 11.1 Fluent HTTP Client (`Http`)
```typescript
import { Http } from 'aerojs';

const res = await Http.baseUrl('https://api.example.com')
  .withToken('auth-token')
  .timeout(5000)
  .retry(3, 100)
  .get('/data', { page: 1 });

if (res.successful) {
  const data = res.json();
}
```

### 11.2 SMTP Mail Transport (`Mail`)
```typescript
import { Mail } from 'aerojs';

Mail.configure({
  default: 'smtp',
  mailers: {
    smtp: {
      driver: 'smtp',
      host: process.env.SMTP_HOST || '127.0.0.1',
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    },
  },
});

await Mail.send((msg) => {
  msg.to('user@example.com')
     .subject('Welcome')
     .html('<h1>Welcome to AeroJS</h1>');
});
```

### 11.3 Redis Rate Limiter & Redis Queue
```typescript
import { rateLimit, RedisRateLimitStore, RedisClient, Queue } from 'aerojs';

const redis = new RedisClient({ host: '127.0.0.1', port: 6379 });

// Rate Limiter
app.use(rateLimit({
  windowMs: 60_000,
  max: 100,
  store: new RedisRateLimitStore({ client: redis, prefix: 'rl:api:' }),
}));

// Queue
Queue.configure({
  default: 'redis',
  connections: {
    redis: { driver: 'redis', redis },
  },
});
```

### 11.4 OAuth 2.0 Social Login (`OAuth`)
```typescript
import { OAuth } from 'aerojs';

router.get('/auth/google', (ctx) => ctx.redirect(OAuth.driver('google').getRedirectUrl()));
router.get('/auth/google/callback', async (ctx) => {
  const { user } = await OAuth.driver('google').handleCallback(ctx.query.code as string);
  ctx.json({ user });
});
```

### 11.5 Multi-Channel Notifications (`Notifications`, `Notification`)
```typescript
import { Notification, Notifications, MailMessage } from 'aerojs';

class OrderAlertNotification extends Notification {
  via() { return ['mail', 'database', 'broadcast']; }
  toMail(u: any) { return new MailMessage().subject('Alert').text('Hello'); }
  toDatabase(u: any) { return { alert: 'Order Confirmed' }; }
}

await Notifications.send(user, new OrderAlertNotification());
```

### 11.6 Tamper-Proof Signed URLs (`UrlSigner`, `validateSignedUrl`)
```typescript
import { UrlSigner, validateSignedUrl, Storage } from 'aerojs';

// Generate temporary signed link
const downloadUrl = await Storage.temporaryUrl('invoices/inv-101.pdf', 900);

// Validate in route
router.get('/secure/download', validateSignedUrl(), async (ctx) => {
  ctx.json({ secure: true });
});
```

### 11.7 Extended CLI Generators (`aero make:*`)
```bash
aero make:job ProcessPayment
aero make:mail OrderReceipt
aero make:policy PatientPolicy
aero make:event PatientAdmitted
aero make:listener NotifyDoctor
```
