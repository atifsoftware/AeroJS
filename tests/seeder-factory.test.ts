import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Model, DB, Schema, ModelFactory, Seeder, DatabaseSeeder } from '../src/database/index.js';

class User extends Model {
  public static override table = 'users';
}

class UserSeeder extends Seeder {
  public async run(): Promise<void> {
    await DB.table('users').insert({ id: 1, name: 'Seeded User' });
  }
}

class MainSeeder extends DatabaseSeeder {
  public async run(): Promise<void> {
    await this.call([UserSeeder]);
  }
}

describe('Seeder and Model Factory', () => {
  beforeEach(async () => {
    await DB.closeAll();
    await DB.beginTransaction('memory');
    await Schema.createTable('users', (table) => {
      table.increments('id');
      table.string('name');
      table.string('role').defaultTo('user');
      table.boolean('active').defaultTo(true);
    });
  });

  afterEach(async () => {
    await DB.closeAll();
  });

  describe('Database Seeders', () => {
    it('should sequentially execute seeders', async () => {
      const seeder = new MainSeeder();
      await seeder.run();

      const user = await DB.table('users').where('id', 1).first();
      expect(user).toBeDefined();
      expect(user?.name).toBe('Seeded User');
    });
  });

  describe('Model Factories', () => {
    let userFactory: ModelFactory<User>;

    beforeEach(() => {
      userFactory = ModelFactory.define(User, () => ({
        name: 'Factory User',
        role: 'user',
        active: true,
      }));

      userFactory.state('admin', () => ({
        role: 'admin',
      }));

      userFactory.state('inactive', () => ({
        active: false,
      }));
    });

    it('should make an in-memory instance without persisting', async () => {
      const user = userFactory.make({ name: 'Override Name' });
      expect(user).toBeInstanceOf(User);
      expect(user.name).toBe('Override Name');
      expect(user.role).toBe('user');

      // Ensure it is not in the database
      const count = await DB.table('users').count();
      expect(count).toBe(0);
    });

    it('should create and persist a model instance', async () => {
      const user = await userFactory.create();
      expect(user.id).toBeDefined();

      const row = await DB.table('users').where('id', user.id).first();
      expect(row).toBeDefined();
      expect(row?.name).toBe('Factory User');
    });

    it('should create multiple instances using createMany', async () => {
      const users = await userFactory.createMany(3);
      expect(users.length).toBe(3);

      const count = await DB.table('users').count();
      expect(count).toBe(3);
    });

    it('should apply state mutations', async () => {
      const admin = await userFactory.applyState('admin').applyState('inactive').create();
      expect(admin.role).toBe('admin');
      expect(admin.active).toBe(false);

      const row = await DB.table('users').where('id', admin.id).first();
      expect(row?.role).toBe('admin');
      expect(row?.active).toBe(false);
    });
  });

  describe('Nested Transaction Savepoints', () => {
    it('should rollback to a savepoint without aborting the parent transaction', async () => {
      await DB.transaction(async (trx) => {
        await User.create({ name: 'Base User' }, trx);

        try {
          await DB.transaction(async (innerTrx) => {
            await User.create({ name: 'Savepoint User' }, innerTrx);
            expect(await DB.table('users').count(innerTrx)).toBe(2);
            throw new Error('Abort inner');
          }, trx);
        } catch (err: any) {
          expect(err.message).toBe('Abort inner');
        }

        // Inner rollback occurred, Base User should remain, Savepoint User removed
        expect(await DB.table('users').count(trx)).toBe(1);

        await User.create({ name: 'Another User' }, trx);
        // Commit parent by finishing normally
      }, 'memory');

      const count = await DB.table('users').count('memory');
      expect(count).toBe(2);

      const users = await DB.table('users').get('memory');
      expect(users[0].name).toBe('Base User');
      expect(users[1].name).toBe('Another User');
    });
  });
});
