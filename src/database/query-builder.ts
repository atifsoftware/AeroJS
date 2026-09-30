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

  public _eagerLoads: string[] = [];

  constructor(tableName: string, adapter: DatabaseAdapter) {
    this.tableName = tableName;
    this.adapter = adapter;
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

  public join(table: string, first: string, operator: string, second: string): this {
    this.joinClauses.push({ type: 'inner', table, first, operator, second });
    return this;
  }

  public leftJoin(table: string, first: string, operator: string, second: string): this {
    this.joinClauses.push({ type: 'left', table, first, operator, second });
    return this;
  }

  public orderBy(column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC' = 'ASC'): this {
    this.orderClauses.push({
      column,
      direction: direction.toUpperCase() as 'ASC' | 'DESC',
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
   * Compiles the current builder state to raw SQL and bindings.
   */
  public toSQL(): { sql: string; bindings: unknown[] } {
    const bindings: unknown[] = [];
    let sql = `SELECT ${this.columns.join(', ')} FROM ${this.tableName}`;

    // Joins
    for (const join of this.joinClauses) {
      const joinType = join.type === 'left' ? 'LEFT JOIN' : 'INNER JOIN';
      sql += ` ${joinType} ${join.table} ON ${join.first} ${join.operator} ${join.second}`;
    }

    // Wheres
    if (this.whereClauses.length > 0) {
      sql += ' WHERE ';
      const parts = this.whereClauses.map((clause, idx) => {
        const prefix = idx > 0 ? `${clause.type.toUpperCase()} ` : '';
        if (clause.operator === 'IN' && Array.isArray(clause.value)) {
          const placeholders = clause.value.map(() => '?').join(', ');
          bindings.push(...clause.value);
          return `${prefix}${clause.column} IN (${placeholders})`;
        }
        if (clause.value === null) {
          return `${prefix}${clause.column} ${clause.operator} NULL`;
        }
        bindings.push(clause.value);
        return `${prefix}${clause.column} ${clause.operator} ?`;
      });
      sql += parts.join(' ');
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
    if (this.adapter instanceof MemoryDatabaseAdapter) {
      return this.executeInMemory();
    }
    const { sql, bindings } = this.toSQL();
    return this.adapter.query<T>(sql, bindings);
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
    if (this.adapter instanceof MemoryDatabaseAdapter) {
      const rows = this.filterMemoryRows(this.adapter.getTableData(this.tableName));
      return rows.length;
    }
    const { sql, bindings } = this.toSQL();
    const countSql = sql.replace(/^SELECT .+? FROM/i, `SELECT COUNT(${column}) as total FROM`);
    const res = await this.adapter.query<{ total: number }>(countSql, bindings);
    return Number(res[0]?.total || 0);
  }

  /**
   * Inserts row(s) and returns insert information.
   */
  public async insert(data: Partial<T> | Partial<T>[]): Promise<{ insertId?: number | string; affectedRows: number }> {
    const records = Array.isArray(data) ? data : [data];
    if (records.length === 0) return { affectedRows: 0 };

    if (this.adapter instanceof MemoryDatabaseAdapter) {
      const tableRows = this.adapter.getTableData(this.tableName);
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

    const first = records[0]!;
    const keys = Object.keys(first);
    const cols = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${cols}) VALUES (${placeholders})`;
    const bindings = keys.map((k) => (first as any)[k]);

    return this.adapter.execute(sql, bindings);
  }

  /**
   * Updates matching records.
   */
  public async update(data: Partial<T>): Promise<number> {
    if (this.adapter instanceof MemoryDatabaseAdapter) {
      const tableRows = this.adapter.getTableData(this.tableName);
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
    const { sql: selectSql, bindings: whereBindings } = this.toSQL();
    const wherePart = selectSql.includes(' WHERE ') ? selectSql.split(' WHERE ')[1] : '';

    const sql = `UPDATE ${this.tableName} SET ${setClause}${wherePart ? ' WHERE ' + wherePart : ''}`;
    const res = await this.adapter.execute(sql, [...setBindings, ...whereBindings]);
    return res.affectedRows;
  }

  /**
   * Deletes matching records.
   */
  public async delete(): Promise<number> {
    if (this.adapter instanceof MemoryDatabaseAdapter) {
      const tableRows = this.adapter.getTableData(this.tableName);
      let deleted = 0;
      for (let i = tableRows.length - 1; i >= 0; i--) {
        if (this.matchesWhere(tableRows[i]!)) {
          tableRows.splice(i, 1);
          deleted++;
        }
      }
      return deleted;
    }

    const { sql: selectSql, bindings } = this.toSQL();
    const wherePart = selectSql.includes(' WHERE ') ? selectSql.split(' WHERE ')[1] : '';
    const sql = `DELETE FROM ${this.tableName}${wherePart ? ' WHERE ' + wherePart : ''}`;
    const res = await this.adapter.execute(sql, bindings);
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

  private executeInMemory(): T[] {
    const rawRows = (this.adapter as MemoryDatabaseAdapter).getTableData(this.tableName);
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
}
