/**
 * @file init.ts
 * @description AeroJS project scaffolding generator (scaffolds complete production structure matching my-aero-app).
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  engineTsContent,
  appTsContent,
  indexEdgeContent,
  initDbContent,
  webRoutesContent,
  apiRoutesContent,
  serverTsContent,
  databaseConfigContent,
} from '../templates/fullstack-templates.js';

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
  const projectName = options.name || (targetDirectory === '.' ? basename(process.cwd()) : targetDirectory.split(/[\\/]/).pop() || 'my-aero-app');
  const template = options.template || 'fullstack';
  const createdFiles: string[] = [];

  const addFile = (relPath: string, content: string) => {
    const fullPath = join(root, relPath);
    writeFileWithDir(fullPath, content);
    createdFiles.push(fullPath);
  };

  // 1. package.json
  const dependencies: Record<string, string> = {
    aerojs: 'npm:@shohaghinfo/aerojs@^0.1.1',
    knex: '^3.3.0',
    mysql2: '^3.11.0',
  };

  const devDependencies: Record<string, string> = {
    '@types/node': '^22.0.0',
    tsx: '^4.19.0',
    typescript: '^5.6.0',
    vitest: '^2.0.0',
  };

  if (template === 'fullstack') {
    dependencies['@types/pg'] = '^8.23.1';
    dependencies['edge.js'] = '^6.5.1';
    dependencies['ejs'] = '^6.0.1';
    dependencies['pg'] = '^8.23.1';
    devDependencies['@types/ejs'] = '^3.1.5';
  }

  addFile('package.json', JSON.stringify({
    name: projectName,
    version: '1.0.0',
    description: 'Production web application powered by AeroJS',
    type: 'module',
    scripts: {
      dev: 'tsx watch server.ts',
      build: 'tsc',
      start: 'node dist/server.js',
      test: 'vitest run',
    },
    dependencies,
    devDependencies,
  }, null, 2) + '\n');

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

  // 2.1 vitest.config.ts
  addFile('vitest.config.ts', `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
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

  addFile('config/database.ts', databaseConfigContent);

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

  // 12.1 Database Initialization
  addFile('database/init-db.ts', initDbContent);

  // 13. Presentation Tiers (Views & Resources)
  if (template === 'fullstack') {
    addFile('app/views/engine.ts', engineTsContent);
    addFile('views/index.edge', indexEdgeContent);
    addFile('resources/js/app.ts', appTsContent);
    addFile('vite.config.ts', `import { defineConfig } from 'vite';
import { join } from 'node:path';

export default defineConfig({
  root: 'resources',
  build: {
    outDir: '../public/build',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        app: join(process.cwd(), 'resources/js/app.ts'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'localhost',
    },
  },
});
`);
  }

  // 14. Routes
  addFile('routes/api.ts', template === 'fullstack' ? apiRoutesContent : `import type { Router } from 'aerojs';
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

  addFile('routes/web.ts', template === 'fullstack' ? webRoutesContent : `import type { Router, AeroContext } from 'aerojs';

export function registerWebRoutes(router: Router): void {
  router.get('/', (ctx: AeroContext) => {
    ctx.html('<h1>Welcome to AeroJS</h1>');
  });
}
`);

  // 15. Server entry point
  addFile('server.ts', template === 'fullstack' ? serverTsContent : `import { AeroJS } from 'aerojs';
import { appConfig } from './config/app.js';
import { registerApiRoutes } from './routes/api.js';
import { registerWebRoutes } from './routes/web.js';
import { join } from 'node:path';
import { initDatabase } from './database/init-db.js';

// Initialize Database connection
await initDatabase();

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

// Start server (only when not in test runner)
if (process.env.NODE_ENV !== 'test') {
  app.listen(appConfig.port, () => {
    console.log(\`\\n🚀 AeroJS Server running at http://localhost:\${appConfig.port}\`);
    console.log(\`👉 Health Check: http://localhost:\${appConfig.port}/api/health\`);
    console.log(\`👉 Users API:   http://localhost:\${appConfig.port}/api/users\\n\`);
  });
}

export default app;
`);

  // 16. Storage & Public placeholder
  addFile('public/robots.txt', `User-agent: *\nAllow: /\n`);
  addFile('storage/logs/.gitkeep', '');
  addFile('storage/uploads/.gitkeep', '');

  // 17. Tests
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

  // 18. AI Agent Guidelines (AGENTS.md & AEROJS.md)
  let agentsMdContent = '';
  try {
    const canonicalAgentsPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../AGENTS.md');
    if (existsSync(canonicalAgentsPath)) {
      agentsMdContent = readFileSync(canonicalAgentsPath, 'utf8');
    }
  } catch {}

  if (!agentsMdContent) {
    try {
      const fallbackPath = resolve(process.cwd(), '../AeroJS/AGENTS.md');
      if (existsSync(fallbackPath)) {
        agentsMdContent = readFileSync(fallbackPath, 'utf8');
      }
    } catch {}
  }

  if (agentsMdContent) {
    addFile('AGENTS.md', agentsMdContent);
  } else {
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

## 3. Verification Commands
Always verify your code changes by running:
\`\`\`bash
npm run build
npm test
\`\`\`
`);
  }

  addFile('AEROJS.md', `# AeroJS Architecture & Developer Guide

Please see [AGENTS.md](./AGENTS.md) for the complete reference manual, covering:
- Layered Architecture (MVC + Service Layer)
- Routing & Controller Tuples (\`[Controller, 'method']\`)
- Database Active Record ORM & QueryBuilder (\`Model\`, \`DB.table\`)
- Database Migrations (\`Schema.create\`, \`TableBlueprint\`)
- MySQL, PostgreSQL, SQLite, Prisma, and Drizzle setups
- Frontend Integrations (Inertia.js React/Vue 3, Edge.js, EJS, SSR)
- Request Validation & Security Middleware
- Background Queue Jobs & Mailers
- In-process Testing with \`createTestClient\`
`);

  return createdFiles;
}
