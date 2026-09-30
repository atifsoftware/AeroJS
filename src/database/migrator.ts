/**
 * @file migrator.ts
 * @description Migration runner for AeroJS database schema migrations.
 */

import { Database } from './connection.js';
import { Schema } from './schema.js';

export interface Migration {
  up(): Promise<void>;
  down(): Promise<void>;
}

export class Migrator {
  public table = 'aero_migrations';
  public connection = 'default';

  constructor(connection = 'default') {
    this.connection = connection;
  }

  public async ensureTableExists(): Promise<void> {
    await Schema.createTable(
      this.table,
      (table) => {
        table.increments('id');
        table.string('name', 255).unique();
        table.integer('batch');
        table.timestamp('executed_at');
      },
      this.connection
    );
  }

  public async getExecutedMigrations(): Promise<string[]> {
    await this.ensureTableExists();
    const rows = await Database.table(this.table, this.connection)
      .select('name')
      .get();
    return rows.map((r: any) => r.name);
  }

  public async getNextBatchNumber(): Promise<number> {
    await this.ensureTableExists();
    const rows = await Database.table(this.table, this.connection).get();
    if (rows.length === 0) return 1;
    const maxBatch = Math.max(...rows.map((r: any) => Number(r.batch || 0)));
    return maxBatch + 1;
  }

  /**
   * Runs an array of migration instances in chronological order.
   */
  public async runMigrations(
    migrations: { name: string; migration: Migration }[]
  ): Promise<string[]> {
    await this.ensureTableExists();
    const executed = await this.getExecutedMigrations();
    const batch = await this.getNextBatchNumber();
    const ran: string[] = [];

    for (const item of migrations) {
      if (executed.includes(item.name)) {
        continue;
      }

      await item.migration.up();
      await Database.table(this.table, this.connection).insert({
        name: item.name,
        batch,
        executed_at: new Date().toISOString(),
      });
      ran.push(item.name);
    }

    return ran;
  }

  /**
   * Rollbacks the last batch of executed migrations.
   */
  public async rollback(
    migrationMap: Record<string, Migration>
  ): Promise<string[]> {
    await this.ensureTableExists();
    const rows = await Database.table(this.table, this.connection).get();
    if (rows.length === 0) return [];

    const lastBatch = Math.max(...rows.map((r: any) => Number(r.batch || 0)));
    const batchRows = rows.filter((r: any) => Number(r.batch) === lastBatch);
    const rolledBack: string[] = [];

    for (const r of batchRows) {
      const mig = migrationMap[r.name];
      if (mig) {
        await mig.down();
      }
      await Database.table(this.table, this.connection)
        .where('name', r.name)
        .delete();
      rolledBack.push(r.name);
    }

    return rolledBack;
  }
}

export default Migrator;
