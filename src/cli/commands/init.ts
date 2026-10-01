/**
 * @file init.ts
 * @description AeroJS project scaffolding generator (scaffolds complete production structure).
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

export interface InitProjectOptions {
  name?: string;
  template?: 'api' | 'fullstack';
}

function writeFileWithDir(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content.trimStart(), 'utf-8');
}

export function initProject(targetDirectory = '.', options: InitProjectOptions = {}): string[] {
  const root = resolve(process.cwd(), targetDirectory);
  const projectName = options.name || (targetDirectory === '.' ? 'my-aero-app' : targetDirectory.split(/[\\/]/).pop() || 'my-aero-app');
  const createdFiles: string[] = [];

  const addFile = (relPath: string, content: string) => {
    const fullPath = join(root, relPath);
    writeFileWithDir(fullPath, content);
    createdFiles.push(fullPath);
  };

  // 1. package.json
  addFile('package.json', `{
  "name": "${projectName}",
  "version": "1.0.0",
  "description": "Production web application powered by AeroJS",
  "type": "module",
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "aerojs": "file:../AeroJS"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
`);

  // 2. tsconfig.json
  addFile('tsconfig.json', `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["app/**/*", "config/**/*", "routes/**/*", "database/**/*", "server.ts", "tests/**/*"]
}
`);

  // 3. .env & .env.example
  const envContent = `APP_NAME="${projectName}"
APP_ENV=development
PORT=3000
APP_DEBUG=true
APP_KEY=aerojs_secret_key_${Math.random().toString(36).slice(2)}

# Database (MySQL / PostgreSQL / SQLite)
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_DATABASE=aerojs_app
DB_POOL_MIN=2
DB_POOL_MAX=20

SESSION_DRIVER=memory
QUEUE_DRIVER=memory
MAIL_DRIVER=log
`;
  addFile('.env', envContent);
  addFile('.env.example', envContent);

  // 4. .gitignore
  addFile('.gitignore', `node_modules/
dist/
storage/logs/*
!storage/logs/.gitkeep
storage/uploads/*
!storage/uploads/.gitkeep
.env
`);

  // 5. Config files
  addFile('config/app.ts', `export const appConfig = {
  name: process.env.APP_NAME || '${projectName}',
  port: parseInt(process.env.PORT || '3000', 10),
  debug: process.env.APP_DEBUG === 'true',
};
`);

  addFile('config/database.ts', `const poolMin = parseInt(process.env.DB_POOL_MIN || '2', 10);
const poolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);

export const databaseConfig = {
  default: (process.env.DB_CONNECTION || 'mysql').toLowerCase(),
  pool: { min: poolMin, max: poolMax },
  connections: {
    mysql: {
      client: 'mysql2',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.DB_PASS || ''),
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'aerojs_app',
      pool: { min: poolMin, max: poolMax },
    },
    postgres: {
      client: 'pg',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.DB_PASS || ''),
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'aerojs_app',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      pool: { min: poolMin, max: poolMax },
    },
    sqlite: {
      client: 'better-sqlite3',
      filename: process.env.DB_FILENAME || process.env.DB_DATABASE || 'storage/database.sqlite',
      useNullAsDefault: true,
    },
    memory: {
      client: 'memory',
    },
  },
};
`);

  addFile('config/security.ts', `export const securityConfig = {
  csrf: {
    secret: process.env.APP_KEY || 'default-csrf-secret',
  },
  jwt: {
    secret: process.env.APP_KEY || 'default-jwt-secret',
    expiresIn: '7d',
  },
};
`);

  // 6. Controllers
  addFile('app/controllers/HealthController.ts', `import type { AeroContext } from 'aerojs';

export class HealthController {
  public async check(ctx: AeroContext): Promise<void> {
    ctx.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      framework: 'AeroJS v0.1.0',
    });
  }
}
`);

  addFile('app/controllers/UserController.ts', `import type { AeroContext } from 'aerojs';
import { UserService } from '../services/UserService.js';

export class UserController {
  private userService = new UserService();

  public async index(ctx: AeroContext): Promise<void> {
    const users = await this.userService.getAll();
    ctx.status(200).json({ success: true, data: users });
  }

  public async show(ctx: AeroContext): Promise<void> {
    const { id } = ctx.params as { id: string };
    const user = await this.userService.findById(id);
    if (!user) {
      ctx.status(404).json({ error: 'User not found' });
      return;
    }
    ctx.status(200).json({ success: true, data: user });
  }

  public async store(ctx: AeroContext): Promise<void> {
    const data = ctx.body as any;
    const newUser = await this.userService.create(data);
    ctx.status(201).json({ success: true, data: newUser });
  }
}
`);

  // 7. Models
  addFile('app/models/User.ts', `import { Model } from 'aerojs';

export class User extends Model {
  public static override table = 'users';
  public static override primaryKey = 'id';
  public static override fillable = ['name', 'email', 'role'];
  public static override hidden = ['password'];
}
`);

  // 8. Services
  addFile('app/services/UserService.ts', `export interface UserData {
  id: string | number;
  name: string;
  email: string;
  role: string;
}

export class UserService {
  private users: UserData[] = [
    { id: 1, name: 'Admin User', email: 'admin@aerojs.dev', role: 'admin' },
    { id: 2, name: 'Lead Developer', email: 'dev@aerojs.dev', role: 'developer' },
  ];

  public async getAll(): Promise<UserData[]> {
    return this.users;
  }

  public async findById(id: string | number): Promise<UserData | null> {
    return this.users.find((u) => String(u.id) === String(id)) || null;
  }

  public async create(data: Omit<UserData, 'id'>): Promise<UserData> {
    const newUser: UserData = {
      id: this.users.length + 1,
      role: data.role || 'user',
      name: data.name,
      email: data.email,
    };
    this.users.push(newUser);
    return newUser;
  }
}
`);

  // 9. Validators
  addFile('app/validators/UserValidator.ts', `export const createUserSchema = {
  body: {
    type: 'object',
    required: ['name', 'email'],
    properties: {
      name: { type: 'string', minLength: 2 },
      email: { type: 'string', format: 'email' },
      role: { type: 'string', enum: ['admin', 'developer', 'user'] },
    },
  },
};
`);

  // 10. Middlewares
  addFile('app/middleware/AuthMiddleware.ts', `import type { AeroContext, NextFunction } from 'aerojs';

export async function authMiddleware(ctx: AeroContext, next: NextFunction): Promise<void> {
  const authHeader = ctx.req.get('authorization');
  if (!authHeader) {
    ctx.status(401).json({ error: 'Unauthorized: Missing Authorization header' });
    return;
  }
  await next();
}
`);

  // 11. Jobs
  addFile('app/jobs/WelcomeEmailJob.ts', `import { Job } from 'aerojs';

export class WelcomeEmailJob extends Job {
  public async handle(): Promise<void> {
    console.log(\`[Background Job] Sending welcome email to: \${this.data.email}\`);
  }
}
`);

  // 12. Migrations
  addFile('database/migrations/2026_09_30_000000_create_users_table.ts', `import { Schema, type Migration, type TableBlueprint } from 'aerojs';

export default class CreateUsersTable implements Migration {
  public name = '2026_09_30_000000_create_users_table';

  public async up(): Promise<void> {
    await Schema.create('users', (table: TableBlueprint) => {
      table.increments('id');
      table.string('name').notNull();
      table.string('email').notNull().unique();
      table.string('role').defaultTo('user');
      table.timestamps();
    });
  }

  public async down(): Promise<void> {
    await Schema.dropIfExists('users');
  }
}
`);

  // 13. Routes
  addFile('routes/api.ts', `import type { Router } from 'aerojs';
import { HealthController } from '../app/controllers/HealthController.js';
import { UserController } from '../app/controllers/UserController.js';
import { createUserSchema } from '../app/validators/UserValidator.js';

export function registerApiRoutes(router: Router): void {
  router.group('/api', (api) => {
    api.get('/health', [HealthController, 'check']);

    api.group('/users', (users) => {
      users.get('/', [UserController, 'index']);
      users.get('/:id', [UserController, 'show']);
      users.post('/', [UserController, 'store']).schema(createUserSchema);
    });
  });
}
`);

  addFile('routes/web.ts', `import type { Router, AeroContext } from 'aerojs';

export function registerWebRoutes(router: Router): void {
  router.get('/', (ctx: AeroContext) => {
    ctx.html(\`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to AeroJS — High Performance Full-Stack Framework</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
          :root {
            --bg-base: #060913;
            --bg-card: #0d1322;
            --bg-card-hover: #131c31;
            --border-subtle: #1e293b;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --brand-primary: #38bdf8;
            --brand-indigo: #6366f1;
            --brand-emerald: #10b981;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-base);
            color: var(--text-main);
            min-height: 100vh;
            line-height: 1.6;
            padding-bottom: 4rem;
          }
          .glow-bg {
            position: fixed;
            top: -200px;
            left: 50%;
            transform: translateX(-50%);
            width: 800px;
            height: 450px;
            background: radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 70%);
            pointer-events: none;
            z-index: 0;
          }
          .container {
            max-width: 1140px;
            margin: 0 auto;
            padding: 0 1.5rem;
            position: relative;
            z-index: 1;
          }
          nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem 0;
            border-bottom: 1px solid rgba(30, 41, 59, 0.6);
            margin-bottom: 3.5rem;
          }
          .logo {
            font-size: 1.35rem;
            font-weight: 800;
            color: #fff;
            text-decoration: none;
          }
          .logo span {
            background: linear-gradient(135deg, var(--brand-primary), var(--brand-indigo));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .badge-pill {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            background: rgba(56, 189, 248, 0.1);
            color: var(--brand-primary);
            border: 1px solid rgba(56, 189, 248, 0.25);
          }
          .status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--brand-emerald);
            box-shadow: 0 0 8px var(--brand-emerald);
          }
          .hero {
            text-align: center;
            max-width: 820px;
            margin: 0 auto 4rem;
          }
          .hero h1 {
            font-size: 3rem;
            font-weight: 800;
            letter-spacing: -0.04em;
            line-height: 1.15;
            margin: 1rem 0;
          }
          .hero h1 .accent-text {
            background: linear-gradient(135deg, var(--brand-primary) 0%, #818cf8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .hero p {
            color: var(--text-muted);
            font-size: 1.15rem;
            margin-bottom: 2rem;
            line-height: 1.7;
          }
          .feature-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.6rem;
            justify-content: center;
            margin-bottom: 2rem;
          }
          .tag {
            font-size: 0.8rem;
            font-weight: 500;
            padding: 0.35rem 0.85rem;
            border-radius: 6px;
            background: rgba(30, 41, 59, 0.7);
            color: #cbd5e1;
            border: 1px solid rgba(51, 65, 85, 0.6);
          }
          .hero-cta {
            display: flex;
            gap: 1rem;
            justify-content: center;
          }
          .btn {
            display: inline-flex;
            align-items: center;
            padding: 0.75rem 1.6rem;
            border-radius: 0.6rem;
            font-size: 0.95rem;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.2s ease;
            cursor: pointer;
            border: 1px solid transparent;
          }
          .btn-primary {
            background: linear-gradient(135deg, #0284c7, #2563eb);
            color: #fff;
          }
          .btn-secondary {
            background: #131c2e;
            color: #e2e8f0;
            border-color: #1e293b;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3.5rem;
          }
          .card {
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: 1rem;
            padding: 1.75rem;
          }
          .card h3 {
            font-size: 1.15rem;
            font-weight: 700;
            color: #f1f5f9;
            margin-bottom: 0.5rem;
          }
          .card p {
            color: var(--text-muted);
            font-size: 0.92rem;
            line-height: 1.6;
            margin-bottom: 1.25rem;
          }
          pre {
            background: #060913;
            border: 1px solid #1e293b;
            border-radius: 0.65rem;
            padding: 1rem;
            overflow-x: auto;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.82rem;
            color: #e2e8f0;
            line-height: 1.6;
          }
          .sandbox-card {
            background: linear-gradient(180deg, #0e172a 0%, #060913 100%);
            border: 1px solid #1e293b;
            border-radius: 1rem;
            padding: 2rem;
            margin-bottom: 3.5rem;
          }
          .sandbox-controls {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1.25rem;
          }
          .sandbox-btn {
            background: #1e293b;
            color: #e2e8f0;
            border: 1px solid #334155;
            padding: 0.6rem 1.2rem;
            border-radius: 0.5rem;
            font-size: 0.88rem;
            font-weight: 600;
            cursor: pointer;
          }
          .sandbox-btn:hover {
            background: #0284c7;
            color: #fff;
          }
          .terminal-window {
            background: #030712;
            border: 1px solid #1f2937;
            border-radius: 0.75rem;
            padding: 1.25rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            color: #10b981;
            min-height: 100px;
            white-space: pre-wrap;
          }
          .ai-banner {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(56, 189, 248, 0.15) 100%);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 1rem;
            padding: 2rem;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="glow-bg"></div>
        <div class="container">
          <nav>
            <a href="/" class="logo"><span>🚀 AeroJS</span></a>
            <span class="badge-pill"><span class="status-dot"></span> v0.1.0 Ready</span>
          </nav>
          <section class="hero">
            <div class="badge-pill" style="margin-bottom: 1rem;">⚡ High-Performance Full-Stack TypeScript</div>
            <h1>Welcome to <span class="accent-text">AeroJS</span></h1>
            <p>Your enterprise-grade application is scaffolded and running with full MVC architecture, Active Record ORM, multi-dialect database connection pooling, and multi-frontend view drivers.</p>
            <div class="feature-tags">
              <span class="tag">Zero Core Dependencies</span>
              <span class="tag">Active Record ORM</span>
              <span class="tag">MySQL & PostgreSQL Pool</span>
              <span class="tag">Inertia.js (Vue & React)</span>
              <span class="tag">Edge.js & EJS</span>
              <span class="tag">AI-Native AGENTS.md</span>
            </div>
            <div class="hero-cta">
              <a href="#sandbox" class="btn btn-primary">Test Live APIs</a>
              <a href="/api/health" class="btn btn-secondary">Health Status</a>
            </div>
          </section>

          <div class="grid-2">
            <div class="card">
              <h3>🏛️ Layered MVC + Service Architecture</h3>
              <p>Clean request pipelines with Controller Tuples and decoupled business logic:</p>
              <pre><code>router.group('/api', (api) => {
  api.get('/users', [UserController, 'index']);
  api.post('/users', [UserController, 'store'])
    .schema(createUserSchema);
});</code></pre>
            </div>
            <div class="card">
              <h3>🗄️ Multi-Dialect Database & Pooling</h3>
              <p>Configured with Knex pooling (DB_POOL_MIN & DB_POOL_MAX):</p>
              <pre><code>const poolMin = parseInt(process.env.DB_POOL_MIN || '2', 10);
const poolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);
// MySQL, PostgreSQL, SQLite, or In-Memory</code></pre>
            </div>
            <div class="card">
              <h3>⚡ Active Record ORM & QueryBuilder</h3>
              <p>Laravel/Adonis style models and fluent QueryBuilder:</p>
              <pre><code>const user = await User.where('role', 'admin').first();
const orders = await DB.table('orders').paginate(1, 15);</code></pre>
            </div>
            <div class="card">
              <h3>🎨 Frontend Views (Inertia, Edge, EJS)</h3>
              <p>Single Page Apps with Inertia.js or server-rendered HTML:</p>
              <pre><code>// Inertia (React / Vue 3)
await ctx.inertia.render('Users/Index', { users });
// Edge.js or EJS
await ctx.view('welcome', { title: 'Dashboard' });</code></pre>
            </div>
          </div>

          <section id="sandbox" class="sandbox-card">
            <h3 style="color:#fff; margin-bottom: 0.5rem;">🧪 Interactive API Sandbox</h3>
            <p style="color: #94a3b8; margin-bottom: 1rem;">Click below to test your AeroJS endpoints:</p>
            <div class="sandbox-controls">
              <button class="sandbox-btn" id="btn-health">GET /api/health</button>
              <button class="sandbox-btn" id="btn-users">GET /api/users</button>
            </div>
            <div class="terminal-window" id="terminal-output">// Click a button above to run live API test...</div>
          </section>

          <section class="ai-banner">
            <h3 style="color:#fff; margin-bottom: 0.5rem;">🤖 AI-Native Engineering with AGENTS.md</h3>
            <p style="color:#cbd5e1;">Your project includes a complete AI reference manual in AGENTS.md for AI agents and human developers.</p>
          </section>
        </div>

        <script>
          const terminal = document.getElementById('terminal-output');
          async function callApi(url) {
            terminal.innerText = 'Connecting to ' + url + '...';
            try {
              const res = await fetch(url);
              const data = await res.json();
              terminal.innerText = 'HTTP ' + res.status + ' OK\\n' + JSON.stringify(data, null, 2);
            } catch (err) {
              terminal.innerText = 'Request Error: ' + err.message;
            }
          }
          document.getElementById('btn-health').addEventListener('click', () => callApi('/api/health'));
          document.getElementById('btn-users').addEventListener('click', () => callApi('/api/users'));
        </script>
      </body>
      </html>
    \`);
  });
}
`);

  // 14. Server entry point
  addFile('server.ts', `import { AeroJS } from 'aerojs';
import { appConfig } from './config/app.js';
import { registerApiRoutes } from './routes/api.js';
import { registerWebRoutes } from './routes/web.js';
import { join } from 'node:path';

const app = new AeroJS({
  debug: appConfig.debug,
  trustProxy: true,
});

// Middlewares
app.useCors();
app.useSecurityHeaders();
app.serveStatic('/public', join(process.cwd(), 'public'));

// Register Routes
registerWebRoutes(app.router);
registerApiRoutes(app.router);

// Start server
app.listen(appConfig.port, () => {
  console.log(\`\\n🚀 AeroJS Server running at http://localhost:\${appConfig.port}\`);
  console.log(\`👉 Health Check: http://localhost:\${appConfig.port}/api/health\`);
  console.log(\`👉 Users API:   http://localhost:\${appConfig.port}/api/users\\n\`);
});

export default app;
`);

  // 15. Storage & Public placeholder
  addFile('public/robots.txt', `User-agent: *\nAllow: /\n`);
  addFile('storage/logs/.gitkeep', '');
  addFile('storage/uploads/.gitkeep', '');

  // 16. Tests
  addFile('tests/app.test.ts', `import { describe, it, expect } from 'vitest';
import { createTestClient } from 'aerojs/testing';
import app from '../server.js';

describe('AeroJS Application End-to-End Tests', () => {
  const client = createTestClient(app);

  it('GET / returns HTML landing page', async () => {
    const res = await client.get('/');
    expect(res.status).toBe(200);
    expect(res.text()).toContain('Welcome to AeroJS');
  });

  it('GET /api/health returns health status', async () => {
    const res = await client.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.json().status).toBe('ok');
    expect(res.json().framework).toContain('AeroJS');
  });

  it('GET /api/users returns list of users', async () => {
    const res = await client.get('/api/users');
    expect(res.status).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().data.length).toBeGreaterThan(0);
  });
});
`);

  // 17. AI Agent Guidelines (AGENTS.md & AEROJS.md)
  addFile('AGENTS.md', `# AeroJS AI Agent Architecture & Coding Guidelines

> **Notice for AI Coding Assistants (Gemini, Claude, Cursor, Windsurf, Copilot, ChatGPT):**
> This file is your canonical reference manual for writing correct, idiomatic, high-performance TypeScript code for applications built on **AeroJS**. Always adhere strictly to the conventions, patterns, and APIs documented here.

## 1. Core Architecture Pattern
AeroJS uses a layered Full-Stack MVC & Service-Oriented Architecture:
\`\`\`
Router -> Middleware -> Validator -> Controller -> Service -> Model / DB -> View / Response
\`\`\`

## 2. Directory Structure Conventions
- \`app/controllers/\`: HTTP handlers. Keep lean; delegate logic to services.
- \`app/services/\`: Reusable business logic, database transactions, external APIs.
- \`app/models/\`: Active Record Models extending \`Model\`.
- \`app/validators/\`: JSON Schema validation definitions.
- \`app/middleware/\`: Interceptors \`(ctx: AeroContext, next: NextFunction) => Promise<void>\`.
- \`app/jobs/\`: Asynchronous background queue jobs extending \`Job\`.
- \`config/\`: Environment configurations (\`app.ts\`, \`database.ts\`, \`security.ts\`).
- \`database/migrations/\`: Migrations using \`Schema.create('table', (table) => ...)\`.
- \`routes/\`: Route groups (\`api.ts\`, \`web.ts\`).

## 3. Route & Controller Definition
\`\`\`typescript
import type { Router } from 'aerojs';
import { UserController } from '../app/controllers/UserController.js';
import { createUserSchema } from '../app/validators/UserValidator.js';

export function registerApiRoutes(router: Router): void {
  router.group('/api', (api) => {
    api.group('/users', (users) => {
      users.get('/', [UserController, 'index']);
      users.get('/:id', [UserController, 'show']);
      users.post('/', [UserController, 'store']).schema(createUserSchema);
    });
  });
}
\`\`\`

## 4. Active Record Models & Database
\`\`\`typescript
import { Model, DB } from 'aerojs';

export class User extends Model {
  public static override table = 'users';
  public static override primaryKey = 'id';
  public static override fillable = ['name', 'email', 'role'];
  public static override hidden = ['password'];
  public static override softDeletes = true;
}

// Queries
const user = await User.find(1);
const admins = await User.where('role', 'admin').get();
const newUser = await User.create({ name: 'Alice', email: 'alice@dev.com', role: 'admin' });

// QueryBuilder
const orders = await DB.table('orders')
  .where('status', 'completed')
  .orderBy('created_at', 'DESC')
  .paginate(1, 15);
\`\`\`

## 5. Database Migrations
\`\`\`typescript
import { Schema, type Migration, type TableBlueprint } from 'aerojs';

export default class CreateUsersTable implements Migration {
  public name = 'create_users_table';

  public async up(): Promise<void> {
    await Schema.create('users', (table: TableBlueprint) => {
      table.increments('id');
      table.string('name', 255).notNull();
      table.string('email', 191).notNull().unique();
      table.string('role').defaultTo('user');
      table.timestamps();
    });
  }

  public async down(): Promise<void> {
    await Schema.dropIfExists('users');
  }
}
\`\`\`

## 6. Frontend Integrations (Inertia, Vite, Edge.js, EJS)
- **Vite Integration (React & Vue 3 with Inertia)**:
  Configure \`vite.config.ts\` with \`build.outDir: 'public/build'\` and use AeroJS \`vite(entry)\` helper:
  \`\`\`typescript
  import { vite } from 'aerojs';

  app.useInertia({
    rootView: \`<!DOCTYPE html>
      <html>
        <head>\${vite('resources/js/app.ts')}</head>
        <body>@inertia</body>
      </html>\`,
  });
  \`\`\`
- **Edge.js Templates**:
  \`\`\`typescript
  app.useViewEngine(createEdgeDriver(edgeInstance));
  await ctx.view('welcome', { user });
  \`\`\`
- **EJS Templates**:
  \`\`\`typescript
  app.useViewEngine(createEjsDriver(ejsInstance));
  await ctx.view('pages/home.ejs', { title });
  \`\`\`

## 7. Verification Commands
Always verify your code changes by running:
\`\`\`bash
npm run build
npm test
\`\`\`
`);

  addFile('AEROJS.md', `# AeroJS Architecture Reference

Please refer to [AGENTS.md](./AGENTS.md) for full architecture patterns, conventions, and guidelines.
`);

  return createdFiles;
}
