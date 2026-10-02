/**
 * @file sqlite.ts
 * @description Native Zero-Dependency SQLite Database Adapter for AeroJS using node:sqlite.
 */

import { createRequire } from 'node:module';
import type { DatabaseAdapter, DatabaseRow } from './connection.js';
import { Database, DB } from './connection.js';
import { QueryBuilder } from './query-builder.js';
import { Logger } from '../logging/logger.js';

const req = createRequire(import.meta.url);

export class SqliteDatabaseAdapter implements DatabaseAdapter {
  public readonly dialect = 'sqlite3';
  public readonly db: any;

  constructor(locationOrDb: string | any = ':memory:') {
    if (typeof locationOrDb === 'string') {
      const { DatabaseSync } = req('node:sqlite');
      this.db = new DatabaseSync(locationOrDb);
    } else if (locationOrDb && typeof locationOrDb === 'object') {
      this.db = locationOrDb;
    } else {
      const { DatabaseSync } = req('node:sqlite');
      this.db = new DatabaseSync(':memory:');
    }
  }

  public table<T extends DatabaseRow = DatabaseRow>(name: string): QueryBuilder<T> {
    return new QueryBuilder<T>(name, this);
  }

  public async query<T = DatabaseRow>(sql: string, bindings: unknown[] = []): Promise<T[]> {
    const start = Date.now();
    try {
      const stmt = this.db.prepare(sql);
      const normalizedBindings = bindings.map((b) => typeof b === 'boolean' ? (b ? 1 : 0) : b) as any[];
      const rows = stmt.all(...normalizedBindings);
      return rows.map((r: any) => ({ ...r })) as unknown as T[];
    } finally {
      const duration = Date.now() - start;
      Logger.logQuery(sql, bindings, duration);
    }
  }

  public async execute(
    sql: string,
    bindings: unknown[] = []
  ): Promise<{ insertId?: number | string; affectedRows: number }> {
    const start = Date.now();
    try {
      const stmt = this.db.prepare(sql);
      const normalizedBindings = bindings.map((b) => typeof b === 'boolean' ? (b ? 1 : 0) : b) as any[];
      const result = stmt.run(...normalizedBindings);
      return {
        insertId: Number(result.lastInsertRowid),
        affectedRows: Number(result.changes),
      };
    } finally {
      const duration = Date.now() - start;
      Logger.logQuery(sql, bindings, duration);
    }
  }

  public async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const res = await callback(this);
      this.db.exec('COMMIT');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  public async savepoint(name: string): Promise<void> {
    this.db.exec(`SAVEPOINT ${name}`);
  }

  public async rollbackTo(name: string): Promise<void> {
    this.db.exec(`ROLLBACK TO SAVEPOINT ${name}`);
  }

  public async close(): Promise<void> {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }
}

/**
 * Connects native SQLite as the underlying database engine for AeroJS.
 */
export function useSqlite(locationOrDb: string | any = ':memory:', connectionName = 'default'): SqliteDatabaseAdapter {
  const adapter = new SqliteDatabaseAdapter(locationOrDb);
  Database.setAdapter(adapter, connectionName);
  (Database as any).sqlite = adapter;
  (DB as any).sqlite = adapter;
  (globalThis as any).__AERO_SQLITE__ = adapter;
  return adapter;
}
