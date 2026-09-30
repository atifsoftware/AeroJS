/**
 * @file 06-service-providers.ts
 * @description Aero ServiceProvider example demonstrating lifecycle registration, boot, and shutdown.
 */

import { Aero, ServiceProvider } from '../src/index.js';

class DatabaseConnection {
  public connected = false;
  async connect() {
    this.connected = true;
    console.log('[Database] Connected successfully');
  }
  async disconnect() {
    this.connected = false;
    console.log('[Database] Disconnected');
  }
}

class DatabaseServiceProvider extends ServiceProvider {
  override register() {
    this.app.container.singleton('db', () => new DatabaseConnection());
  }

  override async boot() {
    const db = this.app.container.resolve<DatabaseConnection>('db');
    await db.connect();
  }

  override async shutdown() {
    const db = this.app.container.resolve<DatabaseConnection>('db');
    await db.disconnect();
  }
}

const app = new Aero({ debug: true });
app.register(DatabaseServiceProvider);

app.get('/db/status', (ctx) => {
  const db = ctx.container?.resolve<DatabaseConnection>('db');
  ctx.json({ databaseConnected: db?.connected });
});

const PORT = 3000;
await app.listenAsync(PORT);
console.log(`🚀 Aero 06-service-providers listening on http://localhost:${PORT}`);
