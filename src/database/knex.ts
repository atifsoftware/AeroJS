/**
 * @file knex.ts
 * @description First-Class Knex.js Integration for AeroJS.
 * Bridges Knex query builder and connection pools to Aero's DatabaseAdapter,
 * Active Record Models, Migrator, and HttpContext.
 */

import type { DatabaseAdapter, DatabaseRow } from './connection.js';
import { Database, DB } from './connection.js';
import { Logger } from '../logging/logger.js';

export class KnexDatabaseAdapter implements DatabaseAdapter {
  public readonly knex: any;

  constructor(knexInstance: any) {
    this.knex = knexInstance;
  }

  public async query<T = DatabaseRow>(sql: string, bindings: unknown[] = []): Promise<T[]> {
    const start = Date.now();
    try {
      const result = await this.knex.raw(sql, bindings);
      return this.normalizeRows<T>(result);
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
      const result = await this.knex.raw(sql, bindings);
      return this.normalizeExecuteResult(result);
    } finally {
      const duration = Date.now() - start;
      Logger.logQuery(sql, bindings, duration);
    }
  }

  public async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    return await this.knex.transaction(async (trx: any) => {
      const trxAdapter = new KnexDatabaseAdapter(trx);
      return await callback(trxAdapter);
    });
  }

  public async close(): Promise<void> {
    if (typeof this.knex.destroy === 'function') {
      await this.knex.destroy();
    }
  }

  private normalizeRows<T>(result: any): T[] {
    if (!result) return [];
    // PostgreSQL: result.rows
    if (Array.isArray(result.rows)) {
      return result.rows as T[];
    }
    // MySQL: [rows, fields]
    if (Array.isArray(result) && Array.isArray(result[0])) {
      return result[0] as T[];
    }
    // SQLite / Mock: result is array
    if (Array.isArray(result)) {
      return result as T[];
    }
    return [result] as T[];
  }

  private normalizeExecuteResult(result: any): { insertId?: number | string; affectedRows: number } {
    if (!result) return { affectedRows: 0 };
    // MySQL / SQLite
    if (result.insertId !== undefined || result.affectedRows !== undefined) {
      return {
        insertId: result.insertId,
        affectedRows: result.affectedRows ?? 1,
      };
    }
    // PostgreSQL: result.rowCount
    if (result.rowCount !== undefined) {
      const firstRow = result.rows?.[0];
      return {
        insertId: firstRow?.id,
        affectedRows: result.rowCount,
      };
    }
    return { affectedRows: 1 };
  }
}

/**
 * Connects Knex as the underlying database engine for AeroJS.
 */
export function useKnex(knexInstance: any, connectionName = 'default'): KnexDatabaseAdapter {
  const adapter = new KnexDatabaseAdapter(knexInstance);
  Database.setAdapter(adapter, connectionName);
  (Database as any).knex = knexInstance;
  (DB as any).knex = knexInstance;
  return adapter;
}
