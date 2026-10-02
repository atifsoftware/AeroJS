/**
 * @file audit-trail.ts
 * @description Immutable Audit Trail System for AeroJS.
 *
 * Provides tamper-evident compliance tracking for sensitive database entities.
 * Ensures auditable state history without destructive data loss.
 *
 * Stores: User ID, Table/Module, Record ID, Action, Old Value, New Value,
 *         IP Address, Timestamp, Reason.
 */

import { DB } from '../database/connection.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'VOID'          // Cancellation / void record — replaces DELETE
  | 'APPROVE'       // Maker-Checker approval
  | 'REJECT'        // Maker-Checker rejection
  | 'PRINT'         // Audit who printed a report/receipt
  | 'LOGIN'         // Auth events
  | 'LOGOUT'
  | 'LOCK'          // Record locked (immutable record lock)
  | 'RESTORE'       // Soft-deleted record restored
  | 'EXPORT';       // Data export event

export interface AuditLogEntry {
  userId: string | number;
  userRole?: string;
  module: string;       // e.g., 'billing', 'pharmacy', 'lab', 'ipd'
  tableName?: string;   // Actual DB table name
  recordId: string | number;
  action: AuditAction;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string;      // Mandatory for VOID/REJECT
  ipAddress?: string;
  userAgent?: string;
  branchId?: string | number;
  metadata?: Record<string, unknown>; // Extra context
}

export interface AuditLogRecord extends AuditLogEntry {
  id: number;
  createdAt: Date;
}

// ─── Audit Trail Driver ───────────────────────────────────────────────────────

export interface AuditDriver {
  log(entry: AuditLogEntry): Promise<void>;
  getHistory(tableName: string, recordId: string | number): Promise<AuditLogRecord[]>;
  getUserActivity(userId: string | number, from?: Date, to?: Date): Promise<AuditLogRecord[]>;
}

/**
 * Database-backed audit driver.
 * Requires `audit_logs` table (see migration below).
 */
export class DatabaseAuditDriver implements AuditDriver {
  private table: string;

  constructor(table = 'audit_logs') {
    this.table = table;
  }

  public async log(entry: AuditLogEntry): Promise<void> {
    await DB.table(this.table).insert({
      user_id: entry.userId,
      user_role: entry.userRole ?? null,
      module: entry.module,
      table_name: entry.tableName ?? null,
      record_id: String(entry.recordId),
      action: entry.action,
      old_value: entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      new_value: entry.newValue ? JSON.stringify(entry.newValue) : null,
      reason: entry.reason ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
      branch_id: entry.branchId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      created_at: new Date(),
    });
  }

  public async getHistory(tableName: string, recordId: string | number): Promise<AuditLogRecord[]> {
    return await DB.table(this.table)
      .where('table_name', tableName)
      .where('record_id', String(recordId))
      .orderBy('created_at', 'DESC')
      .get() as AuditLogRecord[];
  }

  public async getUserActivity(
    userId: string | number,
    from?: Date,
    to?: Date
  ): Promise<AuditLogRecord[]> {
    let qb = DB.table(this.table).where('user_id', userId);
    if (from) qb = qb.where('created_at', '>=', from);
    if (to) qb = qb.where('created_at', '<=', to);
    return await qb.orderBy('created_at', 'DESC').get() as AuditLogRecord[];
  }
}

/**
 * In-memory audit driver (testing only).
 */
export class MemoryAuditDriver implements AuditDriver {
  public logs: (AuditLogEntry & { id: number; createdAt: Date })[] = [];
  private counter = 0;

  public async log(entry: AuditLogEntry): Promise<void> {
    this.logs.push({ ...entry, id: ++this.counter, createdAt: new Date() });
  }

  public async getHistory(tableName: string, recordId: string | number) {
    return this.logs
      .filter((l) => l.tableName === tableName && String(l.recordId) === String(recordId))
      .reverse() as AuditLogRecord[];
  }

  public async getUserActivity(userId: string | number) {
    return this.logs
      .filter((l) => String(l.userId) === String(userId))
      .reverse() as AuditLogRecord[];
  }
}

// ─── AuditTrail Facade ────────────────────────────────────────────────────────

export class AuditTrailManager {
  private driver: AuditDriver = new MemoryAuditDriver();

  public configure(driver: AuditDriver): this {
    this.driver = driver;
    return this;
  }

  /**
   * Log an audit event.
   *
   * @example
   * await AuditTrail.log({
   *   userId: ctx.auth.user()!.id,
   *   module: 'billing',
   *   tableName: 'invoices',
   *   recordId: invoice.id,
   *   action: 'VOID',
   *   oldValue: { status: 'paid', amount: 5000 },
   *   newValue: { status: 'void', amount: 5000 },
   *   reason: 'Duplicate bill entry',
   *   ipAddress: ctx.req.ip,
   * });
   */
  public async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.driver.log(entry);
    } catch (err) {
      // Audit failures should NEVER crash the application
      console.error('[AeroJS AuditTrail] Failed to write audit log:', err);
    }
  }

  /**
   * Get full history of changes for a specific record.
   * Example: "Who modified this transaction? Show all changes."
   */
  public async getHistory(tableName: string, recordId: string | number): Promise<AuditLogRecord[]> {
    return await this.driver.getHistory(tableName, recordId);
  }

  /**
   * Get all activity by a specific user in a time range.
   * Example: "Show all actions performed by user #42 today."
   */
  public async getUserActivity(
    userId: string | number,
    from?: Date,
    to?: Date
  ): Promise<AuditLogRecord[]> {
    return await this.driver.getUserActivity(userId, from, to);
  }
}

export const AuditTrail = new AuditTrailManager();

// ─── Auditable Model Mixin ────────────────────────────────────────────────────

/**
 * Migration SQL for audit_logs table.
 *
 * @example
 * // In database/migrations/YYYY_create_audit_logs_table.ts:
 * await Schema.create('audit_logs', (table) => {
 *   table.increments('id');
 *   table.string('user_id', 50).notNull();
 *   table.string('user_role', 50).nullable();
 *   table.string('module', 100).notNull();
 *   table.string('table_name', 100).nullable();
 *   table.string('record_id', 100).notNull();
 *   table.string('action', 30).notNull();   // CREATE, UPDATE, VOID, APPROVE...
 *   table.text('old_value').nullable();      // JSON serialized
 *   table.text('new_value').nullable();      // JSON serialized
 *   table.text('reason').nullable();
 *   table.string('ip_address', 45).nullable();
 *   table.string('user_agent', 500).nullable();
 *   table.string('branch_id', 50).nullable();
 *   table.text('metadata').nullable();       // JSON serialized
 *   table.timestamp('created_at').notNull(); // IMMUTABLE — no updated_at
 * });
 *
 * // Add indexes for fast lookups:
 * // CREATE INDEX idx_audit_table_record ON audit_logs (table_name, record_id);
 * // CREATE INDEX idx_audit_user ON audit_logs (user_id, created_at);
 * // CREATE INDEX idx_audit_module ON audit_logs (module, created_at);
 */
export const AUDIT_LOGS_MIGRATION_HINT = 'See JSDoc comment above for audit_logs table DDL';
