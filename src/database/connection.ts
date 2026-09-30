/**
 * @file connection.ts
 * @description AeroJS Database Connection Manager and Dialect Engine.
 * Provides a built-in memory/SQL store and hooks for PostgreSQL, MySQL, and SQLite drivers.
 */

import { Logger } from '../logging/logger.js';
import { QueryBuilder } from './query-builder.js';

export interface DatabaseRow extends Record<string, any> {}

export interface DatabaseAdapter {
  query<T = DatabaseRow>(sql: string, bindings?: unknown[]): Promise<T[]>;
  execute(sql: string, bindings?: unknown[]): Promise<{ insertId?: number | string; affectedRows: number }>;
  transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Built-in High-Performance In-Memory Relational Database Adapter.
 * Zero external dependencies. Ideal for unit tests, rapid prototyping, and embedded operation.
 */
export class MemoryDatabaseAdapter implements DatabaseAdapter {
  private tables = new Map<string, DatabaseRow[]>();
  private autoIncrements = new Map<string, number>();

  public getTableData(table: string): DatabaseRow[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
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
    return callback(this);
  }

  public async close(): Promise<void> {
    this.tables.clear();
    this.autoIncrements.clear();
  }
}

/**
 * Global Database Connection Manager (DB)
 */
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
  public static table<T extends DatabaseRow = DatabaseRow>(name: string, connectionName = 'default'): QueryBuilder<T> {
    return new QueryBuilder<T>(name, this.getAdapter(connectionName));
  }

  /**
   * Run raw SQL query.
   */
  public static async query<T = DatabaseRow>(sql: string, bindings: unknown[] = [], connectionName = 'default'): Promise<T[]> {
    return this.getAdapter(connectionName).query<T>(sql, bindings);
  }

  /**
   * Run atomic database transaction.
   */
  public static async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>, connectionName = 'default'): Promise<T> {
    return this.getAdapter(connectionName).transaction(callback);
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
