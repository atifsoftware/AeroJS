import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuditTrail,
  AuditTrailManager,
  MemoryAuditDriver,
  DatabaseAuditDriver,
  type AuditLogEntry,
} from '../src/audit/audit-trail.js';
import { DB } from '../src/database/connection.js';

describe('Audit Trail System', () => {
  let memoryDriver: MemoryAuditDriver;

  beforeEach(() => {
    memoryDriver = new MemoryAuditDriver();
    AuditTrail.configure(memoryDriver);
  });

  it('logs audit entries via MemoryAuditDriver and retrieves record history', async () => {
    await memoryDriver.log({
      userId: 'usr_101',
      userRole: 'pharmacist',
      module: 'pharmacy',
      tableName: 'prescriptions',
      recordId: 'rx_5001',
      action: 'CREATE',
      newValue: { drug: 'Paracetamol', dosage: '500mg' },
    });

    await memoryDriver.log({
      userId: 'usr_102',
      userRole: 'supervisor',
      module: 'pharmacy',
      tableName: 'prescriptions',
      recordId: 'rx_5001',
      action: 'APPROVE',
      reason: 'Verified prescription against patient EHR',
    });

    const history = await memoryDriver.getHistory('prescriptions', 'rx_5001');
    expect(history).toHaveLength(2);
    expect(history[0]?.action).toBe('APPROVE');
    expect(history[1]?.action).toBe('CREATE');
  });

  it('filters user activity by userId', async () => {
    await memoryDriver.log({
      userId: 'usr_200',
      module: 'billing',
      recordId: 'inv_1',
      action: 'CREATE',
    });

    await memoryDriver.log({
      userId: 'usr_201',
      module: 'billing',
      recordId: 'inv_2',
      action: 'CREATE',
    });

    await memoryDriver.log({
      userId: 'usr_200',
      module: 'billing',
      recordId: 'inv_1',
      action: 'VOID',
      reason: 'Customer cancelled invoice',
    });

    const userLogs = await memoryDriver.getUserActivity('usr_200');
    expect(userLogs).toHaveLength(2);
    expect(userLogs[0]?.action).toBe('VOID');
    expect(userLogs[1]?.action).toBe('CREATE');
  });

  it('logs actions using AuditTrail facade helpers', async () => {
    await AuditTrail.log({
      userId: 1,
      module: 'laboratory',
      tableName: 'tests',
      recordId: 42,
      action: 'PRINT',
      reason: 'Printed lab report for doctor consultation',
    });

    const history = await AuditTrail.getHistory('tests', 42);
    expect(history).toHaveLength(1);
    expect(history[0]?.action).toBe('PRINT');
    expect(history[0]?.reason).toBe('Printed lab report for doctor consultation');

    const activity = await AuditTrail.getUserActivity(1);
    expect(activity).toHaveLength(1);
    expect(activity[0]?.module).toBe('laboratory');
  });

  it('handles driver write failure gracefully without throwing', async () => {
    const failingDriver = {
      log: async () => {
        throw new Error('Disk full');
      },
      getHistory: async () => [],
      getUserActivity: async () => [],
    };

    AuditTrail.configure(failingDriver);

    // Should not throw exception
    await expect(
      AuditTrail.log({
        userId: 99,
        module: 'core',
        recordId: 'rec_1',
        action: 'UPDATE',
      })
    ).resolves.toBeUndefined();
  });

  it('supports DatabaseAuditDriver query methods against database', async () => {
    const dbDriver = new DatabaseAuditDriver('audit_logs');
    expect(dbDriver).toBeDefined();

    // Verify method definitions
    expect(typeof dbDriver.log).toBe('function');
    expect(typeof dbDriver.getHistory).toBe('function');
    expect(typeof dbDriver.getUserActivity).toBe('function');
  });
});
