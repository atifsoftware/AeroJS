import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { Aero, AeroContext, inject } from '../src/index.js';

class GreeterService {
  public getGreeting(name: string): string {
    return `Hello, ${name}! Welcome from GreeterService.`;
  }
}

class UserController {
  constructor(@inject('GreeterService') private greeter: GreeterService) {}

  public async index(ctx: AeroContext) {
    return ctx.json({
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
      greeting: this.greeter.getGreeting('Visitors'),
    });
  }

  public async show(ctx: AeroContext) {
    // Return direct object to test auto-send feature
    return {
      userId: ctx.params.id,
      message: this.greeter.getGreeting(ctx.params.id || 'User'),
    };
  }
}

describe('Phase 6: Named Middleware, Route Groups & Controllers', () => {
  let app: Aero;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = new Aero({ debug: true });

    // 1. DI container setup for Controller
    app.container.singleton('GreeterService', () => new GreeterService());

    // 2. Named Middleware registration
    app.middleware('auth', async (ctx, next) => {
      const authHeader = ctx.headers['authorization'];
      if (!authHeader || authHeader !== 'Bearer secret-token') {
        ctx.status(401).json({ error: 'Unauthorized via named auth middleware' });
        return;
      }
      ctx.state.user = { id: 1, role: 'member' };
      await next();
    });

    app.middleware('adminOnly', async (ctx, next) => {
      if ((ctx.state.user as any)?.role !== 'admin') {
        ctx.status(403).json({ error: 'Forbidden: admin only' });
        return;
      }
      await next();
    });

    // 3. Controller Route using RouteBuilder
    app.get('/users', [UserController, 'index'])
      .as('users.index')
      .middleware('auth');

    app.get('/users/:id', [UserController, 'show'])
      .as('users.show');

    // 4. Route Groups with nested groups and group middleware
    app.group('/api/v1', (v1) => {
      v1.use(async (ctx, next) => {
        ctx.set('X-API-Version', '1.0');
        await next();
      });

      v1.get('/ping', (ctx) => {
        ctx.text('pong');
      });

      // Nested group
      v1.group('/admin', (admin) => {
        admin.use('auth');
        admin.use('adminOnly');

        admin.get('/stats', (ctx) => {
          ctx.json({ activeUsers: 42, serverLoad: 'normal' });
        });
      });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates named URLs via urlFor on RouteBuilder registered routes', () => {
    expect(app.urlFor('users.index')).toBe('/users');
    expect(app.urlFor('users.show', { id: '42' })).toBe('/users/42');
  });

  it('enforces named middleware on controller routes', async () => {
    // Without token: 401
    const unauthRes = await fetch(`${baseUrl}/users`);
    expect(unauthRes.status).toBe(401);
    const unauthBody = await unauthRes.json();
    expect(unauthBody.error).toBe('Unauthorized via named auth middleware');

    // With token: 200 and controller DI injected
    const authRes = await fetch(`${baseUrl}/users`, {
      headers: { authorization: 'Bearer secret-token' },
    });
    expect(authRes.status).toBe(200);
    const authBody = await authRes.json();
    expect(authBody.users).toHaveLength(2);
    expect(authBody.greeting).toContain('Visitors');
  });

  it('auto-sends returned value from controller action', async () => {
    const res = await fetch(`${baseUrl}/users/99`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('99');
    expect(body.message).toContain('Hello, 99!');
  });

  it('applies group prefix and group middleware', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ping`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-api-version')).toBe('1.0');
    expect(await res.text()).toBe('pong');
  });

  it('applies nested group middleware hierarchy', async () => {
    // 1. Without auth -> 401
    const res1 = await fetch(`${baseUrl}/api/v1/admin/stats`);
    expect(res1.status).toBe(401);

    // 2. With auth (member) but not admin -> 403
    const res2 = await fetch(`${baseUrl}/api/v1/admin/stats`, {
      headers: { authorization: 'Bearer secret-token' },
    });
    expect(res2.status).toBe(403);
    const body2 = await res2.json();
    expect(body2.error).toContain('admin only');
  });

  it('throws an error if an unregistered named middleware is called', async () => {
    const brokenApp = new Aero();
    brokenApp.get('/broken', 'nonexistentMiddleware', (ctx) => {
      ctx.send('ok');
    });

    let brokenPort = 0;
    const brokenServer = await new Promise<Server>((resolve) => {
      const s = brokenApp.listen(0, '127.0.0.1', () => {
        const addr = s.address();
        if (typeof addr === 'object' && addr !== null) {
          brokenPort = addr.port;
        }
        resolve(s);
      });
    });

    try {
      const res = await fetch(`http://127.0.0.1:${brokenPort}/broken`);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error.message).toContain('nonexistentMiddleware');
    } finally {
      await brokenApp.close();
    }
  });
});
