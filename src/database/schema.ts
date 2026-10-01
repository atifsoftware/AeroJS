/**
 * @file schema.ts
 * @description Schema Builder and Table Blueprint for AeroJS database migrations.
 */

import { Database } from './connection.js';

export interface ColumnDefinition {
  name: string;
  type: string;
  isPrimary?: boolean;
  isAutoIncrement?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: unknown;
}

export class TableBlueprint {
  public tableName: string;
  public columns: ColumnDefinition[] = [];

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  public increments(name = 'id'): this {
    this.columns.push({
      name,
      type: 'INTEGER',
      isPrimary: true,
      isAutoIncrement: true,
    });
    return this;
  }

  public string(name: string, length = 255): this {
    this.columns.push({
      name,
      type: `VARCHAR(${length})`,
      isNullable: false,
    });
    return this;
  }

  public integer(name: string): this {
    this.columns.push({
      name,
      type: 'INTEGER',
      isNullable: false,
    });
    return this;
  }

  public boolean(name: string): this {
    this.columns.push({
      name,
      type: 'BOOLEAN',
      isNullable: false,
      defaultValue: false,
    });
    return this;
  }

  public text(name: string): this {
    this.columns.push({
      name,
      type: 'TEXT',
      isNullable: true,
    });
    return this;
  }

  public timestamp(name: string): this {
    this.columns.push({
      name,
      type: 'TIMESTAMP',
      isNullable: true,
    });
    return this;
  }

  public timestamps(): this {
    this.timestamp('created_at');
    this.timestamp('updated_at');
    return this;
  }

  public notNull(): this {
    const last = this.columns[this.columns.length - 1];
    if (last) last.isNullable = false;
    return this;
  }

  public nullable(): this {
    const last = this.columns[this.columns.length - 1];
    if (last) last.isNullable = true;
    return this;
  }

  public unique(): this {
    const last = this.columns[this.columns.length - 1];
    if (last) last.isUnique = true;
    return this;
  }

  public defaultTo(val: unknown): this {
    const last = this.columns[this.columns.length - 1];
    if (last) last.defaultValue = val;
    return this;
  }
}

export class Schema {
  public static readonly tableDefaults = new Map<string, Record<string, unknown>>();

  public static async createTable(
    tableName: string,
    callback: (table: TableBlueprint) => void,
    connection = 'default'
  ): Promise<void> {
    const blueprint = new TableBlueprint(tableName);
    callback(blueprint);

    const defaults: Record<string, unknown> = {};
    for (const col of blueprint.columns) {
      if (col.defaultValue !== undefined) {
        defaults[col.name] = col.defaultValue;
      }
    }
    Database.tableDefaults.set(tableName, defaults);

    const columnDefs = blueprint.columns.map((col) => {
      let def = `${col.name} ${col.type}`;
      if (col.isPrimary) def += ' PRIMARY KEY';
      if (col.isAutoIncrement) def += ' AUTOINCREMENT';
      if (!col.isNullable && !col.isPrimary) def += ' NOT NULL';
      if (col.isUnique) def += ' UNIQUE';
      if (col.defaultValue !== undefined) {
        def += ` DEFAULT ${typeof col.defaultValue === 'string' ? `'${col.defaultValue}'` : col.defaultValue}`;
      }
      return def;
    });

    const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs.join(', ')})`;
    await Database.getAdapter(connection).execute(sql);
  }

  public static async create(
    tableName: string,
    callback: (table: TableBlueprint) => void,
    connection = 'default'
  ): Promise<void> {
    return this.createTable(tableName, callback, connection);
  }

  public static async dropTableIfExists(tableName: string, connection = 'default'): Promise<void> {
    const sql = `DROP TABLE IF EXISTS ${tableName}`;
    await Database.getAdapter(connection).execute(sql);
  }

  public static async dropIfExists(tableName: string, connection = 'default'): Promise<void> {
    return this.dropTableIfExists(tableName, connection);
  }
}

export default Schema;
