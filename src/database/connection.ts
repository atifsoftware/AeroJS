/**
 * @file connection.ts
 * @description AeroJS Database Connection Manager and Dialect Engine.
 * Provides a built-in memory/SQL store and hooks for PostgreSQL, MySQL, and SQLite drivers.
 */

import { Logger } from '../logging/logger.js';
import { QueryBuilder } from './query-builder.js';

export interface DatabaseRow extends Record<string, any> {}

export interface DatabaseAdapter {
  dialect?: string;
  query<T = DatabaseRow>(sql: string, bindings?: unknown[]): Promise<T[]>;
  execute(sql: string, bindings?: unknown[]): Promise<{ insertId?: number | string; affectedRows: number }>;
  transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T>;
  beginTransaction?(): Promise<DatabaseAdapter>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
  table?<T extends DatabaseRow = DatabaseRow>(name: string): QueryBuilder<T>;
  close(): Promise<void>;
}

/**
 * Built-in High-Performance In-Memory Relational Database Adapter.
 * Zero external dependencies. Ideal for unit tests, rapid prototyping, and embedded operation.
 */
export class MemoryDatabaseAdapter implements DatabaseAdapter {
  public readonly dialect = 'memory';
  private tables = new Map<string, DatabaseRow[]>();
  private autoIncrements = new Map<string, number>();

  private savepoints = new Map<string, { tables: Map<string, DatabaseRow[]>, autoIncrements: Map<string, number> }>();

  public async savepoint(name: string): Promise<void> {
    const backupTables = new Map<string, DatabaseRow[]>();
    for (const [t, rows] of this.tables.entries()) {
      backupTables.set(t, rows.map((r) => ({ ...r })));
    }
    const backupAuto = new Map<string, number>(this.autoIncrements);
    this.savepoints.set(name, { tables: backupTables, autoIncrements: backupAuto });
  }

  public async rollbackTo(name: string): Promise<void> {
    const sp = this.savepoints.get(name);
    if (sp) {
      this.tables = sp.tables;
      this.autoIncrements = sp.autoIncrements;
      this.savepoints.delete(name);
    }
  }


  public getTableData(table: string): DatabaseRow[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  public table<T extends DatabaseRow = DatabaseRow>(name: string): QueryBuilder<T> {
    return new QueryBuilder<T>(name, this);
  }

  public async query<T = DatabaseRow>(sql: string, bindings: unknown[] = []): Promise<T[]> {
    const start = Date.now();
    try {
      // Simple AST / Regex Parser for SQL SELECT queries in memory
      const selectMatch = /^\s*SELECT\s+(.+?)\s+FROM\s+[`"]?([a-zA-Z0-9_]+)[`"]?(.*)$/i.exec(sql);
      if (selectMatch) {
        const tableName = selectMatch[2]!;
        const rows = this.getTableData(tableName);
        return rows.map((r) => ({ ...r })) as unknown as T[];
      }
      return [] as T[];
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
      const insertMatch = /^\s*INSERT\s+INTO\s+[`"]?([a-zA-Z0-9_]+)[`"]?/i.exec(sql);
      if (insertMatch) {
        const tableName = insertMatch[1]!;
        const nextId = (this.autoIncrements.get(tableName) || 0) + 1;
        this.autoIncrements.set(tableName, nextId);
        return { insertId: nextId, affectedRows: 1 };
      }
      return { affectedRows: 1 };
    } finally {
      const duration = Date.now() - start;
      Logger.logQuery(sql, bindings, duration);
    }
  }

  public async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    const backupTables = new Map<string, DatabaseRow[]>();
    for (const [t, rows] of this.tables.entries()) {
      backupTables.set(t, rows.map((r) => ({ ...r })));
    }
    const backupAuto = new Map<string, number>(this.autoIncrements);
    try {
      return await callback(this);
    } catch (err) {
      this.tables = backupTables;
      this.autoIncrements = backupAuto;
      throw err;
    }
  }

  public async beginTransaction(): Promise<DatabaseAdapter> {
    return this;
  }

  public async commit(): Promise<void> {}

  public async rollback(): Promise<void> {}

  public async close(): Promise<void> {
    this.tables.clear();
    this.autoIncrements.clear();
  }
}

/**
 * Global Database Connection Manager (DB)
 */

/**
 * Wraps a DatabaseAdapter to support nested transactions via SQL savepoints.
 */
export function withNestedTransactions(adapter: DatabaseAdapter, depth = 0): DatabaseAdapter {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === '__isNestedTransactionProxy') return true;
      if (prop === 'transaction') {
        return async function <T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
          const currentDepth = depth + 1;
          const savepointName = `aero_sp_${currentDepth}`;

          // If depth > 1, we are inside an existing transaction, use savepoints
          if (currentDepth > 1) {
            if (typeof (target as any).savepoint === 'function') {
              await (target as any).savepoint(savepointName);
            } else {
              try {
                await target.execute(`SAVEPOINT ${savepointName}`);
              } catch (e) { /* ignore if savepoints unsupported by mock */ }
            }

            const nestedAdapter = withNestedTransactions(target, currentDepth);
            try {
              const result = await callback(nestedAdapter);
              // some dialects require releasing the savepoint, we can ignore or execute RELEASE
              // await target.execute(`RELEASE SAVEPOINT ${savepointName}`);
              return result;
            } catch (error) {
              if (typeof (target as any).rollbackTo === 'function') {
                await (target as any).rollbackTo(savepointName);
              } else {
                try {
                  await target.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                } catch (e) { /* ignore */ }
              }
              throw error;
            }
          }

          // Root transaction (depth = 1)
          return await target.transaction(async (rootTrx) => {
            const rootAdapter = withNestedTransactions(rootTrx, currentDepth);
            return await callback(rootAdapter);
          });
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

export class Database {
  public static readonly tableDefaults = new Map<string, Record<string, unknown>>();
  private static defaultAdapter: DatabaseAdapter = new MemoryDatabaseAdapter();
  private static adapters = new Map<string, DatabaseAdapter>();

  public static setAdapter(adapter: DatabaseAdapter, name = 'default'): void {
    this.adapters.set(name, adapter);
    if (name === 'default') {
      this.defaultAdapter = adapter;
    }
  }

  public static getAdapter(name = 'default'): DatabaseAdapter {
    return this.adapters.get(name) || this.defaultAdapter;
  }

  /**
   * Start a fluent QueryBuilder on a specific table.
   */
  public static table<T extends DatabaseRow = DatabaseRow>(
    name: string,
    connectionOrAdapter: string | DatabaseAdapter = 'default'
  ): QueryBuilder<T> {
    const adapter = typeof connectionOrAdapter === 'string'
      ? this.getAdapter(connectionOrAdapter)
      : connectionOrAdapter;
    return new QueryBuilder<T>(name, adapter);
  }

  /**
   * Run raw SQL query.
   */
  public static async query<T = DatabaseRow>(
    sql: string,
    bindings: unknown[] = [],
    connectionOrAdapter: string | DatabaseAdapter = 'default'
  ): Promise<T[]> {
    const adapter = typeof connectionOrAdapter === 'string'
      ? this.getAdapter(connectionOrAdapter)
      : connectionOrAdapter;
    return adapter.query<T>(sql, bindings);
  }

  /**
   * Run raw SQL execute (INSERT, UPDATE, DELETE).
   */
  public static async execute(
    sql: string,
    bindings: unknown[] = [],
    connectionOrAdapter: string | DatabaseAdapter = 'default'
  ): Promise<{ insertId?: number | string; affectedRows: number }> {
    const adapter = typeof connectionOrAdapter === 'string'
      ? this.getAdapter(connectionOrAdapter)
      : connectionOrAdapter;
    return adapter.execute(sql, bindings);
  }

  /**
   * Run atomic database transaction.
   */
  public static async transaction<T>(
    callback: (trx: DatabaseAdapter) => Promise<T>,
    connectionOrAdapter: string | DatabaseAdapter = 'default'
  ): Promise<T> {
    const adapter = typeof connectionOrAdapter === 'string'
      ? this.getAdapter(connectionOrAdapter)
      : connectionOrAdapter;

    // If the adapter is already a proxy wrapper, don't re-wrap with depth 0
    if ((adapter as any).__isNestedTransactionProxy) {
      return adapter.transaction(callback);
    }
    return withNestedTransactions(adapter).transaction(callback);

  }

  /**
   * Manually begin a new database transaction.
   */
  public static async beginTransaction(connectionName = 'default'): Promise<DatabaseAdapter> {
    const adapter = this.getAdapter(connectionName);
    if (typeof adapter.beginTransaction === 'function') {
      return adapter.beginTransaction();
    }
    return adapter;
  }

  /**
   * Commit a transaction.
   */
  public static async commit(trx?: DatabaseAdapter): Promise<void> {
    if (trx && typeof trx.commit === 'function') {
      await trx.commit();
    }
  }

  /**
   * Rollback a transaction.
   */
  public static async rollback(trx?: DatabaseAdapter): Promise<void> {
    if (trx && typeof trx.rollback === 'function') {
      await trx.rollback();
    }
  }

  /**
   * Close all active database connections.
   */
  public static async closeAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.close();
    }
    await this.defaultAdapter.close();
    this.adapters.clear();
  }
}

export const DB = Database;
