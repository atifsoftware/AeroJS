/**
 * @file fullstack-templates.ts
 * @description Canonical fullstack application templates for AeroJS.
 */

export const engineTsContent: string = `import { Edge } from 'edge.js';
import { join } from 'node:path';

// Initialize Edge.js instance and mount views directory
const edge = Edge.create();
edge.mount(join(process.cwd(), 'views'));

/**
 * Render template with AdonisJS's Edge template engine
 */
export async function renderEdge(templateName: string, data: Record<string, unknown> = {}): Promise<string> {
  return edge.render(templateName, data);
}
`;

export const appTsContent: string = `/**
 * AeroJS Client Entrypoint
 * Standard entry for Vite, Inertia.js (React / Vue 3), and client-side scripts.
 */

console.log('🚀 AeroJS client-side application loaded');
`;

export const indexEdgeContent: string = `<!DOCTYPE html>
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
      --border-highlight: #38bdf8;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --brand-primary: #38bdf8;
      --brand-cyan: #06b6d4;
      --brand-indigo: #6366f1;
      --brand-emerald: #10b981;
      --brand-amber: #f59e0b;
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
    .ambient-glow {
      position: fixed;
      top: -200px;
      left: 50%;
      transform: translateX(-50%);
      width: 900px;
      height: 500px;
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
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1.35rem;
      font-weight: 800;
      color: #fff;
    }
    .brand span {
      background: linear-gradient(135deg, var(--brand-primary), var(--brand-indigo));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .badge-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      background: rgba(56, 189, 248, 0.12);
      color: var(--brand-primary);
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
    }
    .nav-links {
      display: flex;
      gap: 0.75rem;
    }
    .nav-btn {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.88rem;
      text-decoration: none;
      transition: all 0.2s;
    }
    .nav-btn:hover {
      color: #fff;
      border-color: var(--brand-primary);
    }
    .nav-btn.primary {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #fff;
      border-color: transparent;
      font-weight: 600;
    }
    .hero {
      text-align: center;
      max-width: 820px;
      margin: 0 auto 4rem;
    }
    .hero h1 {
      font-size: 3rem;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 1.25rem;
      letter-spacing: -0.03em;
    }
    .hero h1 span {
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      font-size: 1.15rem;
      color: var(--text-muted);
      margin-bottom: 2rem;
      line-height: 1.6;
    }
    .hero-actions {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 2.5rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.6rem;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.95rem;
      text-decoration: none;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-main {
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      color: #fff;
      box-shadow: 0 4px 15px rgba(2, 132, 199, 0.35);
    }
    .btn-main:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(2, 132, 199, 0.45);
    }
    .btn-outline {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
    }
    .btn-outline:hover {
      border-color: var(--brand-primary);
      transform: translateY(-2px);
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3.5rem;
    }
    .feature-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 1.75rem;
      transition: all 0.2s ease;
    }
    .feature-card:hover {
      transform: translateY(-3px);
      border-color: rgba(56, 189, 248, 0.4);
      background: var(--bg-card-hover);
    }
    .card-icon {
      font-size: 1.8rem;
      margin-bottom: 1rem;
    }
    .feature-card h3 {
      font-size: 1.2rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 0.5rem;
    }
    .feature-card p {
      font-size: 0.92rem;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .architecture-box {
      background: #090e1a;
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 2rem;
      margin-bottom: 3.5rem;
    }
    .architecture-box h3 {
      font-size: 1.3rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    pre {
      background: #040711;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 1.25rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      color: #38bdf8;
      overflow-x: auto;
      line-height: 1.5;
    }
    footer {
      text-align: center;
      padding-top: 2rem;
      border-top: 1px solid var(--border-subtle);
      color: var(--text-muted);
      font-size: 0.88rem;
    }
  </style>
</head>
<body>
  <div class="ambient-glow"></div>

  <div class="container">
    <nav>
      <div class="brand">
        <span>🚀 AeroJS</span>
        <span class="badge-pill">v0.1.1</span>
      </div>
      <div class="nav-links">
        <a href="/docs" target="_blank" class="nav-btn primary">📚 Swagger API Docs</a>
        <a href="/openapi.json" target="_blank" class="nav-btn">OpenAPI Spec</a>
        <a href="/api/health" target="_blank" class="nav-btn">API Health</a>
      </div>
    </nav>

    <section class="hero">
      <h1>The Next-Gen <span>Full-Stack Web Framework</span> for Node.js</h1>
      <p>
        Zero external runtime dependencies in core engine. High-throughput HTTP routing, built-in Active Record ORM, DI container, automated OpenAPI documentation, and flexible frontend drivers.
      </p>
      <div class="hero-actions">
        <a href="/docs" class="btn btn-main">Explore Swagger API Docs &rarr;</a>
        <a href="/api/health" class="btn btn-outline">Check Health Status</a>
      </div>
    </section>

    <div class="grid-3">
      <div class="feature-card">
        <div class="card-icon">⚡</div>
        <h3>Zero-Dependency Engine</h3>
        <p>Built purely on top of Node.js native standard primitives. No bloated runtime baggage, delivering maximum throughput and ultra-low memory overhead.</p>
      </div>

      <div class="feature-card">
        <div class="card-icon">🏛️</div>
        <h3>Layered Architecture</h3>
        <p>Strict MVC & Service-Oriented pattern. Clean separation between Routers, Middlewares, Input Validators, Thin Controllers, and Reusable Services.</p>
      </div>

      <div class="feature-card">
        <div class="card-icon">🗄️</div>
        <h3>Active Record ORM</h3>
        <p>Fluent QueryBuilder, relationships (hasMany, belongsTo), lifecycle hooks, migration blueprints, and Knex connection pooling for MySQL, PostgreSQL, and SQLite.</p>
      </div>

      <div class="feature-card">
        <div class="card-icon">📚</div>
        <h3>Interactive OpenAPI Docs</h3>
        <p>Integrated Swagger UI and OpenAPI 3.0 spec auto-generated from your route definitions and validation schemas with live request execution.</p>
      </div>

      <div class="feature-card">
        <div class="card-icon">🎨</div>
        <h3>Flexible Presentation</h3>
        <p>Support for Inertia.js (React 18 & Vue 3 SPAs) as well as classic Server-Side Rendering with Edge.js and EJS template drivers.</p>
      </div>

      <div class="feature-card">
        <div class="card-icon">🛡️</div>
        <h3>Enterprise Security</h3>
        <p>Built-in CORS, Security Headers, CSRF protection, Rate Limiting, Session & JWT Guards, and Audit Trail logging out of the box.</p>
      </div>
    </div>

    <div class="architecture-box">
      <h3><span>🏗️</span> Request Lifecycle Flow</h3>
      <pre>Incoming HTTP Request
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
   [Response / View Engine / Inertia.js]</pre>
    </div>

    <footer>
      <p>Powered by <strong>@shohaghinfo/aerojs</strong> • Built for high-performance mission-critical applications.</p>
    </footer>
  </div>
</body>
</html>
`;

export const initDbContent: string = `import knex from 'knex';
import { useKnex } from 'aerojs';
import { databaseConfig } from '../config/database.js';

export async function initDatabase(): Promise<void> {
  const activeDialect = databaseConfig.default;
  const dialectConfig = (databaseConfig.connections as any)[activeDialect];

  if (!dialectConfig) {
    return;
  }

  // Initialize Knex with active connection pool
  const db = knex({
    client: dialectConfig.client,
    connection: dialectConfig.connection,
    pool: databaseConfig.pool,
    useNullAsDefault: activeDialect === 'sqlite',
  });

  useKnex(db);
}

// Run immediately if executed directly
if (process.argv[1]?.endsWith('init-db.ts') || process.argv[1]?.endsWith('init-db.js')) {
  initDatabase()
    .then(() => {
      console.log('🎉 Database connection initialized successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Database initialization error:', err);
      process.exit(1);
    });
}
`;

export const webRoutesContent: string = `import type { Router, AeroContext } from 'aerojs';
import { SwaggerGenerator, renderSwaggerUI } from 'aerojs';
import { renderEdge } from '../app/views/engine.js';

export function registerWebRoutes(router: Router): void {
  // 1. Interactive Swagger UI & OpenAPI Specification
  router.get('/openapi.json', async (ctx: AeroContext) => {
    const spec = SwaggerGenerator.generate([...router.routes], {
      title: '🚀 AeroJS Application API Documentation',
      version: '1.0.0',
      description: 'High-throughput OpenAPI 3.0 specification auto-generated from route definitions and schemas.',
      servers: [
        { url: 'http://localhost:3000', description: 'Local Development Server' },
      ],
    });
    ctx.status(200).json(spec);
  });

  router.get('/docs', async (ctx: AeroContext) => {
    const html = renderSwaggerUI({
      title: '🚀 AeroJS API Documentation',
      specUrl: '/openapi.json',
    });
    ctx.status(200).html(html);
  });

  router.get('/api/docs', async (ctx: AeroContext) => {
    ctx.redirect('/docs', 302);
  });

  // 2. Default Welcome Home Page (rendered with Edge.js)
  router.get('/', async (ctx: AeroContext) => {
    const html = await renderEdge('index', {});
    ctx.html(html);
  });

  // 3. Demo route demonstrating interactive Error Dashboard
  router.get('/demo-error', () => {
    const user: any = undefined;
    return user.profile.getSettings();
  });
}
`;

export const apiRoutesContent: string = `import type { Router } from 'aerojs';
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
`;

export const serverTsContent: string = `import { AeroJS } from 'aerojs';
import { appConfig } from './config/app.js';
import { registerApiRoutes } from './routes/api.js';
import { registerWebRoutes } from './routes/web.js';
import { join } from 'node:path';
import { initDatabase } from './database/init-db.js';

const app = new AeroJS({
  debug: appConfig.debug,
  trustProxy: true,
});

// Built-in Middlewares
app.useCors();
app.useSecurityHeaders();
app.serveStatic('/public', join(process.cwd(), 'public'));

// Register Application Routes
registerWebRoutes(app.router);
registerApiRoutes(app.router);

// Start server
if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || appConfig.port;
  initDatabase().catch((err) => console.error('[AeroJS] Database init error:', err));
  app.listen(port, () => {
    console.log(\`\\n🚀 AeroJS Server running at http://localhost:\${port}\`);
    console.log(\`👉 API Documentation: http://localhost:\${port}/docs\`);
    console.log(\`👉 Health Check:       http://localhost:\${port}/api/health\\n\`);
  });
}

export default app;
`;

export const databaseConfigContent: string = `/**
 * Database Configuration for AeroJS
 * Supports MySQL, PostgreSQL, SQLite, and In-Memory out-of-the-box.
 *
 * Connection pooling is configured via DB_POOL_MIN and DB_POOL_MAX:
 */
const poolMin = parseInt(process.env.DB_POOL_MIN || '2', 10);
const poolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);

export const databaseConfig = {
  // Active connection dialect: 'mysql' | 'postgres' | 'sqlite' | 'memory'
  default: (process.env.DB_CONNECTION || 'mysql').toLowerCase(),

  // Global connection pool configuration
  pool: {
    min: poolMin,
    max: poolMax,
  },

  connections: {
    // MySQL / MariaDB (Driver: mysql2)
    mysql: {
      client: 'mysql2',
      connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.DB_PASS || ''),
        database: process.env.DB_DATABASE || process.env.DB_NAME || 'aerojs_app',
      },
      pool: { min: poolMin, max: poolMax },
    },

    // PostgreSQL (Driver: pg)
    postgres: {
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.DB_PASS || ''),
        database: process.env.DB_DATABASE || process.env.DB_NAME || 'aerojs_app',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      },
      pool: { min: poolMin, max: poolMax },
    },

    // SQLite (Driver: better-sqlite3 or sqlite3)
    sqlite: {
      client: 'better-sqlite3',
      connection: {
        filename: process.env.DB_FILENAME || process.env.DB_DATABASE || 'storage/database.sqlite',
      },
      useNullAsDefault: true,
    },

    // In-Memory Database (Zero-dependency, ideal for fast unit tests)
    memory: {
      client: 'memory',
    },
  },
};
`;
