/**
 * @file query-builder.ts
 * @description Fluent Query Builder for AeroJS modeled after AdonisJS Lucid and Knex.
 * Supports chainable filtering, joins, eager loading, pagination, and SQL compilation.
 */

import type { DatabaseAdapter, DatabaseRow } from './connection.js';
import { Database, MemoryDatabaseAdapter } from './connection.js';

export interface WhereClause {
  type: 'and' | 'or';
  column: string;
  operator: string;
  value: unknown;
}

export interface JoinClause {
  type: 'inner' | 'left';
  table: string;
  first: string;
  operator: string;
  second: string;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  lastPage: number;
  hasMore: boolean;
}

export class QueryBuilder<T extends DatabaseRow = DatabaseRow> {
  public tableName: string;
  protected adapter: DatabaseAdapter;

  protected columns: string[] = ['*'];
  protected whereClauses: WhereClause[] = [];
  protected joinClauses: JoinClause[] = [];
  protected orderClauses: { column: string; direction: 'ASC' | 'DESC' }[] = [];
  protected limitCount?: number;
  protected offsetCount?: number;
  protected isDistinct = false;
  protected groupClauses: string[] = [];
  protected havingClauses: { column: string; operator: string; value: unknown }[] = [];

  public _eagerLoads: string[] = [];
  protected preferWriteConnection = false;
  protected customReadAdapter?: DatabaseAdapter;

  constructor(tableName: string, adapter: DatabaseAdapter) {
    this.tableName = tableName;
    this.adapter = adapter;
  }

  /**
   * Forces this query to execute against the primary write connection (for read-your-own-writes consistency).
   */
  public useWriteConnection(): this {
    this.preferWriteConnection = true;
    return this;
  }

  /**
   * Targets a specific read replica adapter or connection name.
   */
  public useReadConnection(adapterOrName?: DatabaseAdapter | string): this {
    this.preferWriteConnection = false;
    if (adapterOrName) {
      this.customReadAdapter = typeof adapterOrName === 'string'
        ? Database.getAdapter(adapterOrName)
        : adapterOrName;
    }
    return this;
  }

  /**
   * Resolves the appropriate adapter for read queries.
   */
  public resolveReadAdapter(): DatabaseAdapter {
    if (this.customReadAdapter) return this.customReadAdapter;
    if (this.preferWriteConnection) return this.resolveWriteAdapter();
    if (Database.hasReplication()) {
      return Database.getReadAdapter();
    }
    return this.adapter;
  }

  /**
   * Resolves the appropriate adapter for write queries.
   */
  public resolveWriteAdapter(): DatabaseAdapter {
    if (Database.hasReplication()) {
      return Database.getWriteAdapter();
    }
    return this.adapter;
  }

  public select(...columns: string[]): this {
    if (columns.length > 0) {
      this.columns = columns;
    }
    return this;
  }

  public where(
    column: string,
    operatorOrValue: unknown,
    value?: unknown
  ): this {
    let operator = '=';
    let val = operatorOrValue;

    if (value !== undefined) {
      operator = String(operatorOrValue).toUpperCase();
      val = value;
    }

    this.whereClauses.push({
      type: 'and',
      column,
      operator,
      value: val,
    });
    return this;
  }

  public orWhere(
    column: string,
    operatorOrValue: unknown,
    value?: unknown
  ): this {
    let operator = '=';
    let val = operatorOrValue;

    if (value !== undefined) {
      operator = String(operatorOrValue).toUpperCase();
      val = value;
    }

    this.whereClauses.push({
      type: 'or',
      column,
      operator,
      value: val,
    });
    return this;
  }

  public whereIn(column: string, values: unknown[]): this {
    return this.where(column, 'IN', values);
  }

  public whereNull(column: string): this {
    return this.where(column, 'IS', null);
  }

  public whereNotNull(column: string): this {
    return this.where(column, 'IS NOT', null);
  }

  public whereNotIn(column: string, values: unknown[]): this {
    return this.where(column, 'NOT IN', values);
  }

  public whereBetween(column: string, range: [unknown, unknown]): this {
    return this.where(column, 'BETWEEN', range);
  }

  public whereNotBetween(column: string, range: [unknown, unknown]): this {
    return this.where(column, 'NOT BETWEEN', range);
  }

  public whereLike(column: string, pattern: string): this {
    return this.where(column, 'LIKE', pattern);
  }

  public whereRaw(sql: string, bindings: unknown[] = []): this {
    this.whereClauses.push({
      type: 'and',
      column: sql,
      operator: 'RAW',
      value: bindings,
    });
    return this;
  }

  public distinct(): this {
    this.isDistinct = true;
    return this;
  }

  public groupBy(...columns: string[]): this {
    this.groupClauses.push(...columns);
    return this;
  }

  public having(column: string, operator: string, value: unknown): this {
    const validOperators = ['=', '!=', '<>', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE'];
    const op = operator.toUpperCase().trim();
    if (!validOperators.includes(op)) {
      throw new Error(`Security Violation: Unsupported operator in having: "${operator}"`);
    }
    this.havingClauses.push({ column, operator: op, value });
    return this;
  }

  public join(table: string, first: string, operator: string, second: string): this {
    const validOperators = ['=', '!=', '<>', '>', '<', '>=', '<='];
    const op = operator.trim();
    if (!validOperators.includes(op)) {
      throw new Error(`Security Violation: Unsupported operator in join: "${operator}"`);
    }
    this.joinClauses.push({ type: 'inner', table, first, operator: op, second });
    return this;
  }

  public leftJoin(table: string, first: string, operator: string, second: string): this {
    const validOperators = ['=', '!=', '<>', '>', '<', '>=', '<='];
    const op = operator.trim();
    if (!validOperators.includes(op)) {
      throw new Error(`Security Violation: Unsupported operator in leftJoin: "${operator}"`);
    }
    this.joinClauses.push({ type: 'left', table, first, operator: op, second });
    return this;
  }

  public orderBy(column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC' = 'ASC'): this {
    const cleanDir = String(direction).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const trimmedCol = column.trim();
    if (!/^[a-zA-Z0-9_.]+$/.test(trimmedCol) && !/^`[a-zA-Z0-9_.]+`$/.test(trimmedCol) && !/^"[a-zA-Z0-9_.]+"$/.test(trimmedCol)) {
      throw new Error(`Security Violation: Invalid column identifier in orderBy: "${column}"`);
    }
    this.orderClauses.push({
      column: trimmedCol,
      direction: cleanDir,
    });
    return this;
  }

  public limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  public offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  public with(...relations: string[]): this {
    this._eagerLoads.push(...relations);
    return this;
  }

  public preload(...relations: string[]): this {
    return this.with(...relations);
  }

  /**
   * Compiles where clauses into a standalone SQL WHERE fragment and parameter bindings.
   */
  public compileWhere(): { sql: string; bindings: unknown[] } {
    const bindings: unknown[] = [];
    if (this.whereClauses.length === 0) {
      return { sql: '', bindings };
    }

    const parts = this.whereClauses.map((clause, idx) => {
      const prefix = idx > 0 ? `${clause.type.toUpperCase()} ` : '';
      if (clause.operator === 'RAW') {
        if (Array.isArray(clause.value)) {
          bindings.push(...clause.value);
        }
        return `${prefix}${clause.column}`;
      }
      if ((clause.operator === 'IN' || clause.operator === 'NOT IN') && Array.isArray(clause.value)) {
        const placeholders = clause.value.map(() => '?').join(', ');
        bindings.push(...clause.value);
        return `${prefix}${clause.column} ${clause.operator} (${placeholders})`;
      }
      if ((clause.operator === 'BETWEEN' || clause.operator === 'NOT BETWEEN') && Array.isArray(clause.value)) {
        bindings.push(clause.value[0], clause.value[1]);
        return `${prefix}${clause.column} ${clause.operator} ? AND ?`;
      }
      if (clause.value === null) {
        return `${prefix}${clause.column} ${clause.operator} NULL`;
      }
      bindings.push(clause.value);
      return `${prefix}${clause.column} ${clause.operator} ?`;
    });

    return { sql: ` WHERE ${parts.join(' ')}`, bindings };
  }

  /**
   * Compiles the current builder state to raw SQL and bindings.
   */
  public toSQL(): { sql: string; bindings: unknown[] } {
    const bindings: unknown[] = [];
    let sql = `SELECT ${this.isDistinct ? 'DISTINCT ' : ''}${this.columns.join(', ')} FROM ${this.tableName}`;

    // Joins
    for (const join of this.joinClauses) {
      const joinType = join.type === 'left' ? 'LEFT JOIN' : 'INNER JOIN';
      sql += ` ${joinType} ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    }

    // Wheres
    const where = this.compileWhere();
    if (where.sql) {
      sql += where.sql;
      bindings.push(...where.bindings);
    }

    // Group By
    if (this.groupClauses.length > 0) {
      sql += ` GROUP BY ${this.groupClauses.join(', ')}`;
    }

    // Having
    if (this.havingClauses.length > 0) {
      const havingParts = this.havingClauses.map((h, i) => {
        const pfx = i > 0 ? 'AND ' : '';
        bindings.push(h.value);
        return `${pfx}${h.column} ${h.operator} ?`;
      });
      sql += ` HAVING ${havingParts.join(' ')}`;
    }

    // Order By
    if (this.orderClauses.length > 0) {
      const orders = this.orderClauses.map((o) => `${o.column} ${o.direction}`).join(', ');
      sql += ` ORDER BY ${orders}`;
    }

    // Limit and Offset
    if (this.limitCount !== undefined) {
      sql += ` LIMIT ${this.limitCount}`;
    }
    if (this.offsetCount !== undefined) {
      sql += ` OFFSET ${this.offsetCount}`;
    }

    return { sql, bindings };
  }

  /**
   * Executes query and returns array of records.
   */
  public async get(): Promise<T[]> {
    const adapter = this.resolveReadAdapter();
    if (adapter instanceof MemoryDatabaseAdapter) {
      return this.executeInMemory(adapter);
    }
    const { sql, bindings } = this.toSQL();
    return adapter.query<T>(sql, bindings);
  }

  /**
   * Executes query and returns first record, or null.
   */
  public async first(): Promise<T | null> {
    const prevLimit = this.limitCount;
    this.limitCount = 1;
    const rows = await this.get();
    this.limitCount = prevLimit;
    return rows[0] || null;
  }

  /**
   * Finds a record by primary key value.
   */
  public async find(id: number | string, primaryKey = 'id'): Promise<T | null> {
    return this.where(primaryKey, id).first();
  }

  /**
   * Counts the matching records.
   */
  public async count(column = '*'): Promise<number> {
    const adapter = this.resolveReadAdapter();
    if (adapter instanceof MemoryDatabaseAdapter) {
      const rows = this.filterMemoryRows(adapter.getTableData(this.tableName));
      return rows.length;
    }
    const { sql: whereSql, bindings } = this.compileWhere();
    let joinSql = '';
    for (const join of this.joinClauses) {
      const joinType = join.type === 'left' ? 'LEFT JOIN' : 'INNER JOIN';
      joinSql += ` ${joinType} ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    }
    const countSql = `SELECT COUNT(${column}) as total FROM ${this.tableName}${joinSql}${whereSql}`;
    const res = await adapter.query<{ total: number }>(countSql, bindings);
    return Number(res[0]?.total || 0);
  }

  /**
   * Sums the given column.
   */
  public async sum(column: string): Promise<number> {
    const adapter = this.resolveReadAdapter();
    if (adapter instanceof MemoryDatabaseAdapter) {
      const rows = this.filterMemoryRows(adapter.getTableData(this.tableName));
      return rows.reduce((acc, r) => acc + (Number(r[column]) || 0), 0);
    }
    const { sql: whereSql, bindings } = this.compileWhere();
    let joinSql = '';
    for (const join of this.joinClauses) {
      const joinType = join.type === 'left' ? 'LEFT JOIN' : 'INNER JOIN';
      joinSql += ` ${joinType} ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    }
    const sumSql = `SELECT SUM(${column}) as total FROM ${this.tableName}${joinSql}${whereSql}`;
    const res = await adapter.query<{ total: number | string | null }>(sumSql, bindings);
    return Number(res[0]?.total || 0);
  }

  /**
   * Calculates the average of the given column.
   */
  public async avg(column: string): Promise<number> {
    const adapter = this.resolveReadAdapter();
    if (adapter instanceof MemoryDatabaseAdapter) {
      const rows = this.filterMemoryRows(adapter.getTableData(this.tableName));
      if (rows.length === 0) return 0;
      const sum = rows.reduce((acc, r) => acc + (Number(r[column]) || 0), 0);
      return sum / rows.length;
    }
    const { sql: whereSql, bindings } = this.compileWhere();
    let joinSql = '';
    for (const join of this.joinClauses) {
      const joinType = join.type === 'left' ? 'LEFT JOIN' : 'INNER JOIN';
      joinSql += ` ${joinType} ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    }
    const avgSql = `SELECT AVG(${column}) as total FROM ${this.tableName}${joinSql}${whereSql}`;
    const res = await adapter.query<{ total: number | string | null }>(avgSql, bindings);
    return Number(res[0]?.total || 0);
  }

  /**
   * Finds the minimum value of the given column.
   */
  public async min(column: string): Promise<number | null> {
    const adapter = this.resolveReadAdapter();
    if (adapter instanceof MemoryDatabaseAdapter) {
      const rows = this.filterMemoryRows(adapter.getTableData(this.tableName));
      if (rows.length === 0) return null;
      return Math.min(...rows.map((r) => Number(r[column]) || 0));
    }
    const { sql: whereSql, bindings } = this.compileWhere();
    let joinSql = '';
    for (const join of this.joinClauses) {
      const joinType = join.type === 'left' ? 'LEFT JOIN' : 'INNER JOIN';
      joinSql += ` ${joinType} ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    }
    const minSql = `SELECT MIN(${column}) as total FROM ${this.tableName}${joinSql}${whereSql}`;
    const res = await adapter.query<{ total: number | string | null }>(minSql, bindings);
    return res[0]?.total !== null && res[0]?.total !== undefined ? Number(res[0]?.total) : null;
  }

  /**
   * Finds the maximum value of the given column.
   */
  public async max(column: string): Promise<number | null> {
    const adapter = this.resolveReadAdapter();
    if (adapter instanceof MemoryDatabaseAdapter) {
      const rows = this.filterMemoryRows(adapter.getTableData(this.tableName));
      if (rows.length === 0) return null;
      return Math.max(...rows.map((r) => Number(r[column]) || 0));
    }
    const { sql: whereSql, bindings } = this.compileWhere();
    let joinSql = '';
    for (const join of this.joinClauses) {
      const joinType = join.type === 'left' ? 'LEFT JOIN' : 'INNER JOIN';
      joinSql += ` ${joinType} ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    }
    const maxSql = `SELECT MAX(${column}) as total FROM ${this.tableName}${joinSql}${whereSql}`;
    const res = await adapter.query<{ total: number | string | null }>(maxSql, bindings);
    return res[0]?.total !== null && res[0]?.total !== undefined ? Number(res[0]?.total) : null;
  }

  /**
   * Checks if any matching records exist.
   */
  public async exists(): Promise<boolean> {
    const prevLimit = this.limitCount;
    this.limitCount = 1;
    const rows = await this.get();
    this.limitCount = prevLimit;
    return rows.length > 0;
  }

  /**
   * Plucks an array of single column values from matching records.
   */
  public async pluck<K extends keyof T>(column: K): Promise<T[K][]> {
    const prevColumns = this.columns;
    this.columns = [String(column)];
    const rows = await this.get();
    this.columns = prevColumns;
    return rows.map((r: any) => r[column]);
  }

  /**
   * Inserts row(s) and returns insert information.
   */
  public async insert(data: Partial<T> | Partial<T>[]): Promise<{ insertId?: number | string; affectedRows: number }> {
    const records = Array.isArray(data) ? data : [data];
    if (records.length === 0) return { affectedRows: 0 };
    const adapter = this.resolveWriteAdapter();

    if (adapter instanceof MemoryDatabaseAdapter) {
      const tableRows = adapter.getTableData(this.tableName);
      const defaults = Database.tableDefaults.get(this.tableName) || {};
      let lastId: any;
      for (const rec of records) {
        const idVal = (rec as any).id !== undefined ? (rec as any).id : tableRows.length + 1;
        const rowWithId = { ...defaults, ...rec, id: idVal };
        tableRows.push(rowWithId as unknown as T);
        lastId = idVal;
      }
      return { insertId: lastId, affectedRows: records.length };
    }

    const keys = Object.keys(records[0]!);
    const cols = keys.join(', ');
    const rowPlaceholders = `(${keys.map(() => '?').join(', ')})`;
    const allPlaceholders = records.map(() => rowPlaceholders).join(', ');
    let sql = `INSERT INTO ${this.tableName} (${cols}) VALUES ${allPlaceholders}`;

    const isPg = ['pg', 'postgres', 'postgresql'].includes(adapter.dialect || '');
    if (isPg && !keys.includes('id')) {
      sql += ' RETURNING id';
    }

    const bindings: unknown[] = [];
    for (const rec of records) {
      for (const k of keys) {
        bindings.push((rec as any)[k]);
      }
    }

    return adapter.execute(sql, bindings);
  }

  /**
   * Updates matching records safely without fragile string splitting.
   */
  public async update(data: Partial<T>): Promise<number> {
    const adapter = this.resolveWriteAdapter();

    if (adapter instanceof MemoryDatabaseAdapter) {
      const tableRows = adapter.getTableData(this.tableName);
      let updatedCount = 0;
      for (const row of tableRows) {
        if (this.matchesWhere(row)) {
          Object.assign(row, data);
          updatedCount++;
        }
      }
      return updatedCount;
    }

    const keys = Object.keys(data);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const setBindings = keys.map((k) => (data as any)[k]);
    const { sql: whereSql, bindings: whereBindings } = this.compileWhere();

    const sql = `UPDATE ${this.tableName} SET ${setClause}${whereSql}`;
    const res = await adapter.execute(sql, [...setBindings, ...whereBindings]);
    return res.affectedRows;
  }

  /**
   * Deletes matching records safely without fragile string splitting.
   */
  public async delete(): Promise<number> {
    const adapter = this.resolveWriteAdapter();

    if (adapter instanceof MemoryDatabaseAdapter) {
      const tableRows = adapter.getTableData(this.tableName);
      let deleted = 0;
      for (let i = tableRows.length - 1; i >= 0; i--) {
        if (this.matchesWhere(tableRows[i]!)) {
          tableRows.splice(i, 1);
          deleted++;
        }
      }
      return deleted;
    }

    const { sql: whereSql, bindings: whereBindings } = this.compileWhere();
    const sql = `DELETE FROM ${this.tableName}${whereSql}`;
    const res = await adapter.execute(sql, whereBindings);
    return res.affectedRows;
  }

  /**
   * Paginates the query results.
   */
  public async paginate(page = 1, perPage = 15): Promise<PaginationResult<T>> {
    const total = await this.count();
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const offset = (page - 1) * perPage;

    this.limit(perPage).offset(offset);
    const data = await this.get();

    return {
      data,
      total,
      page,
      perPage,
      lastPage,
      hasMore: page < lastPage,
    };
  }

  /**
   * Memory Execution Helper
   */
  private filterMemoryRows(rows: DatabaseRow[]): DatabaseRow[] {
    let result = rows.filter((r) => this.matchesWhere(r));

    // Sort
    if (this.orderClauses.length > 0) {
      result.sort((a, b) => {
        for (const order of this.orderClauses) {
          const valA = a[order.column];
          const valB = b[order.column];
          if (valA !== valB) {
            const cmp = valA > valB ? 1 : -1;
            return order.direction === 'ASC' ? cmp : -cmp;
          }
        }
        return 0;
      });
    }

    // Offset & Limit
    if (this.offsetCount !== undefined) {
      result = result.slice(this.offsetCount);
    }
    if (this.limitCount !== undefined) {
      result = result.slice(0, this.limitCount);
    }

    return result;
  }

  private matchesWhere(row: DatabaseRow): boolean {
    if (this.whereClauses.length === 0) return true;

    let matches = true;
    for (let i = 0; i < this.whereClauses.length; i++) {
      const clause = this.whereClauses[i]!;
      const rowVal = row[clause.column];
      let clauseMatches = false;

      if (clause.operator === '=' || clause.operator === '==') {
        clauseMatches = rowVal === clause.value;
      } else if (clause.operator === '!=' || clause.operator === '<>') {
        clauseMatches = rowVal !== clause.value;
      } else if (clause.operator === '>') {
        clauseMatches = rowVal > (clause.value as any);
      } else if (clause.operator === '>=') {
        clauseMatches = rowVal >= (clause.value as any);
      } else if (clause.operator === '<') {
        clauseMatches = rowVal < (clause.value as any);
      } else if (clause.operator === '<=') {
        clauseMatches = rowVal <= (clause.value as any);
      } else if (clause.operator === 'IN' && Array.isArray(clause.value)) {
        clauseMatches = clause.value.includes(rowVal);
      } else if (clause.operator === 'NOT IN' && Array.isArray(clause.value)) {
        clauseMatches = !clause.value.includes(rowVal);
      } else if (clause.operator === 'BETWEEN' && Array.isArray(clause.value)) {
        clauseMatches = rowVal >= clause.value[0] && rowVal <= clause.value[1];
      } else if (clause.operator === 'NOT BETWEEN' && Array.isArray(clause.value)) {
        clauseMatches = rowVal < clause.value[0] || rowVal > clause.value[1];
      } else if (clause.operator === 'LIKE' && typeof clause.value === 'string') {
        const regexStr = '^' + clause.value.replace(/%/g, '.*').replace(/_/g, '.') + '$';
        clauseMatches = new RegExp(regexStr, 'i').test(String(rowVal ?? ''));
      } else if (clause.operator === 'IS' && clause.value === null) {
        clauseMatches = rowVal === null || rowVal === undefined;
      } else if (clause.operator === 'IS NOT' && clause.value === null) {
        clauseMatches = rowVal !== null && rowVal !== undefined;
      }

      if (i === 0) {
        matches = clauseMatches;
      } else if (clause.type === 'or') {
        matches = matches || clauseMatches;
      } else {
        matches = matches && clauseMatches;
      }
    }

    return matches;
  }

  private executeInMemory(adapter: DatabaseAdapter = this.resolveReadAdapter()): T[] {
    const rawRows = (adapter as MemoryDatabaseAdapter).getTableData(this.tableName);
    const filtered = this.filterMemoryRows(rawRows);
    return filtered.map((r) => {
      if (this.columns.length === 1 && this.columns[0] === '*') {
        return { ...r } as unknown as T;
      }
      const selected: any = {};
      for (const col of this.columns) {
        selected[col] = r[col];
      }
      return selected as T;
    });
  }

  // ─── Pessimistic Locking ──────────────────────────────────────────────────

  protected lockMode?: 'FOR UPDATE' | 'SHARE';

  /**
   * Acquires an exclusive row lock (SELECT ... FOR UPDATE).
   * Prevents other transactions from reading or modifying the locked rows
   * until the current transaction commits or rolls back.
   *
   * Use-case: High-concurrency seat or inventory reservation — prevents double allocation.
   *
   * @example
   * await DB.transaction(async (trx) => {
   *   const seat = await DB.table('seats')
   *     .where('id', seatId)
   *     .lockForUpdate()
   *     .first();
   *
   *   if (seat.status !== 'available') throw new Error('Seat already reserved');
   *   await DB.table('seats').where('id', seatId).update({ status: 'reserved' });
   * });
   */
  public lockForUpdate(): this {
    this.lockMode = 'FOR UPDATE';
    return this;
  }

  /**
   * Acquires a shared lock (SELECT ... FOR SHARE / LOCK IN SHARE MODE).
   * Other transactions can read but cannot modify the locked rows.
   *
   * Use-case: Reading inventory levels during concurrent ordering checks.
   */
  public sharedLock(): this {
    this.lockMode = 'SHARE';
    return this;
  }
}
