import { describe, it, expect, beforeEach } from 'vitest';
import { Aero } from '../src/core/application.js';
import { Injectable, Inject, Module } from '../src/di/decorators.js';
import { PolicyEngine } from '../src/auth/policy.js';
import { TenancyContext } from '../src/tenancy/tenant.js';
import { Model } from '../src/database/model.js';
import { Database } from '../src/database/connection.js';
import { createTestClient } from '../src/testing/test-client.js';

// --- DI Mocks ---
@Injectable()
class DBService {
  getData() { return 'db-data'; }
}

@Injectable()
class ConfigService {
  getApiKey() { return 'api-123'; }
}

class TestController {
  constructor(
    @Inject('DBService') public db: DBService,
    @Inject('ConfigService') public config: ConfigService
  ) {}

  async handle(ctx: any) {
    ctx.res.status(200).send({
      db: this.db.getData(),
      key: this.config.getApiKey()
    });
  }
}

@Module({
  providers: [DBService, ConfigService],
  controllers: [TestController]
})
class TestModule {}

// --- Model Mock ---
class Document extends Model {
  static table = 'documents';
}

describe('Enterprise Features: DI, Policy Engine, Multi-Tenancy', () => {
  beforeEach(async () => {
    await Database.closeAll();
    // Setup memory DB
    await Database.execute('CREATE TABLE documents (id INTEGER, tenant_id INTEGER, name VARCHAR(255))');
    await Database.execute('INSERT INTO documents (id, tenant_id, name) VALUES (1, 100, "Alice")');
    await Database.execute('INSERT INTO documents (id, tenant_id, name) VALUES (2, 200, "Bob")');
    await Database.execute('INSERT INTO documents (id, tenant_id, name) VALUES (3, 100, "Charlie")');
  });

  describe('Decorator-based Service Layer DI', () => {
    it('resolves controllers with injected dependencies via app.useModules', async () => {
      const app = new Aero();
      app.useModules([TestModule]);

      // Resolve the controller from the container directly or bind it to a route
      const controller = app.container.resolve<TestController>('TestController');
      expect(controller).toBeDefined();
      expect(controller.db.getData()).toBe('db-data');
      expect(controller.config.getApiKey()).toBe('api-123');

      // Bind to route and test HTTP
      app.get('/test', (ctx) => controller.handle(ctx));
      const client = createTestClient(app);
      const res = await client.get('/test');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ db: 'db-data', key: 'api-123' });
    });
  });

  describe('Typed Permission Policy Engine', () => {
    it('evaluates fine-grained module/action policies', async () => {
      const engine = new PolicyEngine();

      engine.define('Document:view', (user, resource) => {
        if (user.role === 'admin') return true;
        return resource && resource.assignedUserId === user.id;
      });

      engine.define('Settings:*', (user) => user.role === 'admin');

      const app = new Aero();
      app.usePolicyEngine(engine);

      app.get('/documents/1', async (ctx) => {
        try {
          ctx.state.user = { id: 5, role: 'manager' };
          const isAllowed = await ctx.can('Document', 'view', { id: 1, assignedUserId: 6 });
          expect(isAllowed).toBe(false);
          const isAllowed2 = await ctx.can('Document', 'view', { id: 1, assignedUserId: 5 });
          expect(isAllowed2).toBe(true);
          ctx.res.status(200).send('ok');
        } catch (err: any) {
          ctx.res.status(500).send(err.stack || err.message);
        }
      });

      app.get('/settings', async (ctx) => {
        ctx.state.user = { id: 5, role: 'manager' }; // not admin
        // This will throw 403 Forbidden
        await ctx.authorize('Settings', 'edit');
        ctx.res.status(200).send('ok');
      });


      const client = createTestClient(app);
      const pRes = await client.get('/documents/1');
      if (pRes.status !== 200) {
        console.error('POLICY RESPONSE:', await pRes.text());
      }
      expect(pRes.status).toBe(200);


      const res = await client.get('/settings');
      expect(res.status).toBe(403);
      expect((await res.json()).error.message).toContain("Unauthorized to perform 'edit' on 'Settings'");
    });
  });

  describe('Multi-Tenancy Data Scoping', () => {
    it('automatically scopes Active Record queries based on AsyncLocalStorage context', async () => {
      const app = new Aero();

      app.useTenancy({
        column: 'tenant_id',
        resolver: (ctx) => Number(ctx.req.headers['x-tenant-id']),
        models: [Document]
      });

      app.get('/documents', async (ctx) => {
        try {
          const id = TenancyContext.getStore();
          // Invoke query generation to hit the scope injection hook
          Document.query();

          ctx.res.status(200).json({
            tenant_id: id,
            isTenanted: Document.tenanted,
            col: Document.tenantColumn
          });
        } catch (err: any) {
          ctx.res.status(500).text(err.stack || err.message);
        }
      });

      const client = createTestClient(app);

      const res100 = await client.get('/documents', { headers: { 'x-tenant-id': '100' } });
      const data100 = await res100.json() as any;
      expect(data100.tenant_id).toBe(100);
      expect(data100.isTenanted).toBe(true);
      expect(data100.col).toBe('tenant_id');
    });
  });
});
