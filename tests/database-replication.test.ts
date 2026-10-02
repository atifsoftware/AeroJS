import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database, MemoryDatabaseAdapter } from '../src/index.js';

describe('Database Read Replicas & Master-Slave Routing', () => {
  let primaryDb: MemoryDatabaseAdapter;
  let replica1: MemoryDatabaseAdapter;
  let replica2: MemoryDatabaseAdapter;

  beforeEach(() => {
    primaryDb = new MemoryDatabaseAdapter();
    replica1 = new MemoryDatabaseAdapter();
    replica2 = new MemoryDatabaseAdapter();

    // Populate data to distinguish the source node
    primaryDb.getTableData('users').push({ id: 1, name: 'Root Admin', source: 'primary' });
    replica1.getTableData('users').push({ id: 1, name: 'Root Admin', source: 'replica1' });
    replica2.getTableData('users').push({ id: 1, name: 'Root Admin', source: 'replica2' });

    Database.configureReplication({
      write: primaryDb,
      read: [replica1, replica2],
    });
  });

  afterEach(() => {
    Database.resetReplication();
  });

  it('detects replication configuration status', () => {
    expect(Database.hasReplication()).toBe(true);
    Database.resetReplication();
    expect(Database.hasReplication()).toBe(false);
  });

  it('routes read queries across replicas round-robin', async () => {
    const read1 = await Database.table('users').first();
    expect(read1?.source).toBe('replica1');

    const read2 = await Database.table('users').first();
    expect(read2?.source).toBe('replica2');

    const read3 = await Database.table('users').first();
    expect(read3?.source).toBe('replica1');
  });

  it('forces read against primary write connection using useWriteConnection()', async () => {
    const res = await Database.table('users').useWriteConnection().first();
    expect(res?.source).toBe('primary');
  });

  it('routes specific read replica via useReadConnection()', async () => {
    const res = await Database.table('users').useReadConnection(replica2).first();
    expect(res?.source).toBe('replica2');
  });

  it('always directs write operations (insert, update, delete) to the primary write database', async () => {
    await Database.table('users').insert({ id: 2, name: 'New User', source: 'primary' });

    // Primary has 2 rows
    expect(primaryDb.getTableData('users')).toHaveLength(2);
    // Replicas still have 1 row
    expect(replica1.getTableData('users')).toHaveLength(1);
    expect(replica2.getTableData('users')).toHaveLength(1);

    // Update applies to primary
    await Database.table('users').where('id', 1).update({ name: 'Updated Master' });
    expect(primaryDb.getTableData('users')[0]?.name).toBe('Updated Master');
    expect(replica1.getTableData('users')[0]?.name).toBe('Root Admin');

    // Delete applies to primary
    await Database.table('users').where('id', 2).delete();
    expect(primaryDb.getTableData('users')).toHaveLength(1);
  });
});
