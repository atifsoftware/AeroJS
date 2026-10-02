import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  Database,
  DB,
  Model,
  Schema,
  TableBlueprint,
  SqliteDatabaseAdapter,
  KnexDatabaseAdapter,
  useSqlite,
  useKnex,
  isSqliteSupported,
  beforeCreate,
  afterCreate,
  beforeSave,
  afterSave,
  beforeDelete,
  afterDelete,
  afterFind,
  afterFetch,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Sample Models for Testing
// ─────────────────────────────────────────────────────────────────────────────

class User extends Model {
  public static override table = 'users';
  public static override primaryKey = 'id';
  public static override fillable = ['name', 'email', 'role', 'active', 'balance', 'token'];
  public static override hidden = ['secret_token'];
  public static override softDeletes = true;

  public static scopeActive(qb: any) {
    return qb.where('active', true);
  }

  public static scopeByRole(qb: any, role: string) {
    return qb.where('role', role);
  }

  public posts() {
    return this.hasMany(Post, 'user_id', 'id');
  }

  public profile() {
    return this.hasOne(Profile, 'user_id', 'id');
  }

  @beforeCreate()
  public static setCreatedToken(instance: any) {
    if (!instance.token) {
      const name = instance.name || instance.get?.('name') || instance._attributes?.name || '';
      instance.token = 'tok_' + name.toLowerCase().replace(/\s+/g, '_');
    }
  }

  @afterCreate()
  public static markCreated(instance: any) {
    instance.__created_hook_ran = true;
  }
}

class Post extends Model {
  public static override table = 'posts';
  public static override primaryKey = 'id';
  public static override fillable = ['user_id', 'title', 'content', 'views'];

  public user() {
    return this.belongsTo(User, 'user_id', 'id');
  }
}

class Profile extends Model {
  public static override table = 'profiles';
  public static override primaryKey = 'id';
  public static override fillable = ['user_id', 'bio', 'avatar'];

  public user() {
    return this.belongsTo(User, 'user_id', 'id');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE ENGINE 1: SQLite (Native node:sqlite in-memory execution)
// ─────────────────────────────────────────────────────────────────────────────

describe.runIf(isSqliteSupported())('Database Engine 1: SQLite (Native Driver & Protocol)', () => {
  let sqliteAdapter: SqliteDatabaseAdapter;

  beforeEach(async () => {
    sqliteAdapter = new SqliteDatabaseAdapter(':memory:');
    Database.setAdapter(sqliteAdapter, 'default');

    // Setup SQLite schema
    await sqliteAdapter.execute(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        role VARCHAR(50) DEFAULT 'user',
        active BOOLEAN DEFAULT 1,
        balance REAL DEFAULT 0,
        token VARCHAR(255),
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    await sqliteAdapter.execute(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);

    await sqliteAdapter.execute(`
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bio TEXT,
        avatar VARCHAR(255),
        created_at TIMESTAMP,
        updated_at TIMESTAMP
      )
    `);
  });

  afterEach(async () => {
    await Database.closeAll();
  });

  describe('SQLite - QueryBuilder Maximum Coverage', () => {
    it('executes INSERT, SELECT, and complex WHERE conditions on SQLite', async () => {
      // 1. Single and batch inserts
      const ins1 = await DB.table('users').insert({ name: 'Alice', email: 'alice@sqlite.org', role: 'admin', active: 1, balance: 250 });
      expect(ins1.insertId).toBe(1);
      expect(ins1.affectedRows).toBe(1);

      await DB.table('users').insert([
        { name: 'Bob', email: 'bob@sqlite.org', role: 'developer', active: 1, balance: 180 },
        { name: 'Charlie', email: 'charlie@sqlite.org', role: 'developer', active: 0, balance: 90 },
        { name: 'David', email: 'david@sqlite.org', role: 'manager', active: 1, balance: 320 },
      ]);

      // 2. WHERE conditions (=, >, IN, BETWEEN, LIKE, IS NULL)
      const admins = await DB.table('users').where('role', 'admin').get();
      expect(admins).toHaveLength(1);
      expect(admins[0]?.name).toBe('Alice');

      const highBalance = await DB.table('users').where('balance', '>=', 200).get();
      expect(highBalance).toHaveLength(2);

      const devOrManager = await DB.table('users').whereIn('role', ['developer', 'manager']).get();
      expect(devOrManager).toHaveLength(3);

      const midBalance = await DB.table('users').whereBetween('balance', [100, 300]).get();
      expect(midBalance).toHaveLength(2);

      const searchBob = await DB.table('users').whereLike('name', '%ob%').get();
      expect(searchBob).toHaveLength(1);
      expect(searchBob[0]?.name).toBe('Bob');

      const notDeleted = await DB.table('users').whereNull('deleted_at').get();
      expect(notDeleted).toHaveLength(4);
    });

    it('supports JOINS, ORDER BY, and PAGINATION on SQLite', async () => {
      await DB.table('users').insert([
        { id: 1, name: 'Author One', email: 'author1@sqlite.org' },
        { id: 2, name: 'Author Two', email: 'author2@sqlite.org' },
      ]);

      await DB.table('posts').insert([
        { user_id: 1, title: 'Post 1A', views: 50 },
        { user_id: 1, title: 'Post 1B', views: 150 },
        { user_id: 2, title: 'Post 2A', views: 75 },
      ]);

      // Inner join
      const userPosts = await DB.table('posts')
        .select('posts.id', 'posts.title', 'users.name as author_name')
        .join('users', 'posts.user_id', '=', 'users.id')
        .orderBy('posts.views', 'DESC')
        .get();

      expect(userPosts).toHaveLength(3);
      expect(userPosts[0]?.title).toBe('Post 1B');
      expect(userPosts[0]?.author_name).toBe('Author One');

      // Pagination
      const page1 = await DB.table('posts').orderBy('id', 'ASC').paginate(1, 2);
      expect(page1.page).toBe(1);
      expect(page1.perPage).toBe(2);
      expect(page1.total).toBe(3);
      expect(page1.lastPage).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.data).toHaveLength(2);

      const page2 = await DB.table('posts').orderBy('id', 'ASC').paginate(2, 2);
      expect(page2.page).toBe(2);
      expect(page2.data).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it('calculates AGGREGATES, FIRST, EXISTS, and PLUCK on SQLite', async () => {
      await DB.table('users').insert([
        { name: 'User 1', balance: 100 },
        { name: 'User 2', balance: 200 },
        { name: 'User 3', balance: 300 },
      ]);

      expect(await DB.table('users').count()).toBe(3);
      expect(await DB.table('users').sum('balance')).toBe(600);
      expect(await DB.table('users').avg('balance')).toBe(200);
      expect(await DB.table('users').min('balance')).toBe(100);
      expect(await DB.table('users').max('balance')).toBe(300);

      const first = await DB.table('users').where('balance', '>', 150).first();
      expect(first?.name).toBe('User 2');

      const exists = await DB.table('users').where('name', 'User 3').exists();
      expect(exists).toBe(true);

      const notExists = await DB.table('users').where('name', 'Missing').exists();
      expect(notExists).toBe(false);

      const balances = await DB.table('users').orderBy('id', 'ASC').pluck('balance');
      expect(balances).toEqual([100, 200, 300]);
    });

    it('handles ATOMIC TRANSACTIONS and SAVEPOINTS on SQLite', async () => {
      // Successful transaction
      await DB.transaction(async (trx) => {
        await trx.execute("INSERT INTO users (name, email) VALUES ('Trx User 1', 'trx1@sqlite.org')");
        await trx.execute("INSERT INTO users (name, email) VALUES ('Trx User 2', 'trx2@sqlite.org')");
      });

      expect(await DB.table('users').count()).toBe(2);

      // Rolled back transaction
      await expect(
        DB.transaction(async (trx) => {
          await trx.execute("INSERT INTO users (name, email) VALUES ('Trx User 3', 'trx3@sqlite.org')");
          throw new Error('Simulated failure triggering rollback');
        })
      ).rejects.toThrow('Simulated failure triggering rollback');

      expect(await DB.table('users').count()).toBe(2); // Count remains 2
    });
  });

  describe('SQLite - Active Record ORM Maximum Coverage', () => {
    it('performs Model CRUD, dirty tracking, and lifecycle hooks on SQLite', async () => {
      // 1. Model.create() with @beforeCreate hook
      const user = await User.create({
        name: 'Sarah Connor',
        email: 'sarah@resistance.org',
        role: 'leader',
        active: true,
        balance: 500,
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe('Sarah Connor');
      expect((user as any).token).toBe('tok_sarah_connor'); // From @beforeCreate hook

      // 2. Model.find()
      const found = await User.find(user.id);
      expect(found).not.toBeNull();
      expect(found?.email).toBe('sarah@resistance.org');

      // 3. Dirty tracking & save()
      found!.name = 'Sarah Connor Sky';
      expect(found!.isDirty('name')).toBe(true);
      expect(found!.isDirty('email')).toBe(false);
      await found!.save();

      const reloaded = await User.find(user.id);
      expect(reloaded?.name).toBe('Sarah Connor Sky');

      // 4. Soft deletes & restore
      await reloaded!.delete();
      const afterDelete = await User.find(user.id);
      expect(afterDelete).toBeNull(); // Excluded by soft deletes

      const withTrashed = await User.query().withTrashed().where('id', user.id).first();
      expect(withTrashed).not.toBeNull();
      expect(withTrashed?.deleted_at).toBeDefined();

      await withTrashed!.restore();
      const restored = await User.find(user.id);
      expect(restored).not.toBeNull();
      expect(restored?.deleted_at).toBeNull();
    });

    it('resolves Relationships (hasMany, belongsTo, hasOne) with Eager Loading on SQLite', async () => {
      const author = await User.create({
        name: 'Jane Austen',
        email: 'jane@austen.org',
      });

      await Post.create({ user_id: author.id, title: 'Pride and Prejudice', views: 1000 });
      await Post.create({ user_id: author.id, title: 'Sense and Sensibility', views: 800 });
      await Profile.create({ user_id: author.id, bio: 'English novelist', avatar: 'jane.png' });

      // Direct relation resolution
      const posts = await author.posts();
      expect(posts).toHaveLength(2);

      const profile = await author.profile();
      expect(profile?.bio).toBe('English novelist');

      const post1 = posts[0];
      const postAuthor = await post1.user();
      expect(postAuthor?.name).toBe('Jane Austen');

      // Eager loading with('posts', 'profile')
      const authorsWithRelations = await User.with('posts', 'profile').get();
      expect(authorsWithRelations).toHaveLength(1);
      expect(authorsWithRelations[0]?.posts).toHaveLength(2);
      expect(authorsWithRelations[0]?.profile?.bio).toBe('English novelist');
    });

    it('applies Model Query Scopes on SQLite', async () => {
      await User.create({ name: 'Active Admin', role: 'admin', active: true });
      await User.create({ name: 'Inactive Admin', role: 'admin', active: false });
      await User.create({ name: 'Active User', role: 'user', active: true });

      const activeUsers = await User.query().active().get();
      expect(activeUsers).toHaveLength(2);

      const activeAdmins = await User.query().active().byRole('admin').get();
      expect(activeAdmins).toHaveLength(1);
      expect(activeAdmins[0]?.name).toBe('Active Admin');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE ENGINE 2: PostgreSQL (Dialect, Protocol & ORM Coverage)
// ─────────────────────────────────────────────────────────────────────────────

describe('Database Engine 2: PostgreSQL (Dialect, Protocol & ORM)', () => {
  let pgClientMock: any;
  let pgAdapter: KnexDatabaseAdapter;
  let executedSqlList: { sql: string; bindings?: unknown[] }[] = [];
  let pgStore: Map<string, any[]> = new Map();

  beforeEach(() => {
    executedSqlList = [];
    pgStore.set('users', [
      { id: 1, name: 'PG Admin', role: 'admin', active: true, balance: 1500, deleted_at: null },
      { id: 2, name: 'PG Developer', role: 'developer', active: true, balance: 1200, deleted_at: null },
    ]);
    pgStore.set('orders', [
      { id: 101, user_id: 1, total_amount: 350, status: 'completed' },
      { id: 102, user_id: 1, total_amount: 650, status: 'pending' },
    ]);

    // Mock PostgreSQL knex client simulating 'pg' driver
    pgClientMock = {
      client: { dialect: 'pg' },
      raw: async (sql: string, bindings: unknown[] = []) => {
        executedSqlList.push({ sql, bindings });
        const cleanSql = sql.trim();

        // 1. PostgreSQL SELECT queries -> format: { rows: [...], rowCount: n }
        if (cleanSql.toUpperCase().startsWith('SELECT')) {
          if (cleanSql.toUpperCase().includes('COUNT(')) {
            return { rows: [{ total: 2 }], rowCount: 1 };
          }
          if (cleanSql.toUpperCase().includes('SUM(')) {
            return { rows: [{ total: 2700 }], rowCount: 1 };
          }

          if (cleanSql.includes('FROM users')) {
            const rows = pgStore.get('users') || [];
            let result = rows;
            if (cleanSql.includes('WHERE')) {
              if (bindings.includes('admin')) {
                result = rows.filter((r) => r.role === 'admin');
              } else if (cleanSql.includes('id = ?')) {
                result = rows.filter((r) => r.id === bindings[0]);
              }
            }
            if (cleanSql.includes('LIMIT 1')) {
              result = result.slice(0, 1);
            }
            return { rows: result.map((r) => ({ ...r })), rowCount: result.length };
          }

          if (cleanSql.includes('FROM orders')) {
            const rows = pgStore.get('orders') || [];
            return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
          }

          return { rows: [], rowCount: 0 };
        }

        // 2. PostgreSQL INSERT with RETURNING id -> format: { rows: [{ id: 3 }], rowCount: 1 }
        if (cleanSql.toUpperCase().startsWith('INSERT')) {
          const nextId = (pgStore.get('users')?.length || 0) + 1;
          const newRow = { id: nextId, name: bindings[0], role: bindings[1] || 'user', deleted_at: null };
          pgStore.get('users')?.push(newRow);
          return {
            rows: [{ id: nextId }],
            rowCount: 1,
          };
        }

        // 3. PostgreSQL UPDATE / DELETE -> format: { rowCount: 1 }
        if (cleanSql.toUpperCase().startsWith('UPDATE') || cleanSql.toUpperCase().startsWith('DELETE')) {
          return { rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      },
      transaction: async (cb: any) => {
        return cb(pgClientMock);
      },
    };

    pgAdapter = new KnexDatabaseAdapter(pgClientMock);
    Database.setAdapter(pgAdapter, 'default');
  });

  afterEach(async () => {
    await Database.closeAll();
  });

  describe('PostgreSQL - Dialect & Protocol Coverage', () => {
    it('identifies dialect as pg/postgres', () => {
      expect(pgAdapter.dialect).toBe('pg');
    });

    it('appends RETURNING id for PostgreSQL INSERT operations', async () => {
      const res = await DB.table('users').insert({ name: 'New PG User', role: 'architect' });
      expect(res.insertId).toBe(3);
      expect(res.affectedRows).toBe(1);

      const lastSql = executedSqlList[executedSqlList.length - 1]?.sql;
      expect(lastSql).toContain('RETURNING id');
    });

    it('correctly normalizes PostgreSQL { rows: [...], rowCount: n } responses in QueryBuilder', async () => {
      const admins = await DB.table('users').where('role', 'admin').get();
      expect(admins).toHaveLength(1);
      expect(admins[0]?.name).toBe('PG Admin');

      const count = await DB.table('users').count();
      expect(count).toBe(2);

      const sum = await DB.table('users').sum('balance');
      expect(sum).toBe(2700);
    });

    it('generates PostgreSQL compliant pessimistic locks: FOR UPDATE and FOR SHARE', () => {
      const forUpdateSql = DB.table('users').where('id', 1).lockForUpdate().toSQL();
      expect(forUpdateSql.sql).toContain('FOR UPDATE');

      const forShareSql = DB.table('users').where('id', 1).sharedLock().toSQL();
      expect(forShareSql.sql).toContain('FOR SHARE');
    });

    it('supports PostgreSQL Active Record Model lifecycle and persistence', async () => {
      const user = await User.create({
        name: 'Postgres Entity',
        email: 'entity@postgres.dev',
        role: 'admin',
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe('Postgres Entity');

      // Update
      user.name = 'Postgres Entity Updated';
      await user.save();

      // Find
      const found = await User.find(1);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('PG Admin');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE ENGINE 3: MySQL (Dialect, Protocol & ORM Coverage)
// ─────────────────────────────────────────────────────────────────────────────

describe('Database Engine 3: MySQL (Dialect, Protocol & ORM)', () => {
  let mysqlClientMock: any;
  let mysqlAdapter: KnexDatabaseAdapter;
  let executedSqlList: { sql: string; bindings?: unknown[] }[] = [];
  let mysqlStore: Map<string, any[]> = new Map();

  beforeEach(() => {
    executedSqlList = [];
    mysqlStore.set('users', [
      { id: 10, name: 'MySQL Admin', role: 'admin', active: 1, balance: 5000, deleted_at: null },
      { id: 20, name: 'MySQL DBA', role: 'dba', active: 1, balance: 4200, deleted_at: null },
    ]);

    // Mock MySQL knex client simulating 'mysql2' driver
    mysqlClientMock = {
      client: { dialect: 'mysql2' },
      raw: async (sql: string, bindings: unknown[] = []) => {
        executedSqlList.push({ sql, bindings });
        const cleanSql = sql.trim();

        // 1. MySQL SELECT queries -> format: [ rows, fields ]
        if (cleanSql.toUpperCase().startsWith('SELECT')) {
          const rows = mysqlStore.get('users') || [];
          let result = rows;
          if (cleanSql.includes('WHERE')) {
            if (bindings.includes('admin')) {
              result = rows.filter((r) => r.role === 'admin');
            } else if (cleanSql.includes('id = ?')) {
              result = rows.filter((r) => r.id === bindings[0]);
            }
          }
          if (cleanSql.includes('LIMIT 1')) {
            result = result.slice(0, 1);
          }
          return [result.map((r) => ({ ...r })), []]; // [rows, fields]
        }

        // 2. MySQL INSERT -> format: [ ResultSetHeader { insertId: 30, affectedRows: 1 }, fields ]
        if (cleanSql.toUpperCase().startsWith('INSERT')) {
          const newId = 30;
          mysqlStore.get('users')?.push({ id: newId, name: bindings[0], role: bindings[1] || 'user', deleted_at: null });
          return [
            { insertId: newId, affectedRows: 1 },
            [],
          ];
        }

        // 3. MySQL UPDATE / DELETE -> format: [ ResultSetHeader { affectedRows: 1 }, fields ]
        if (cleanSql.toUpperCase().startsWith('UPDATE') || cleanSql.toUpperCase().startsWith('DELETE')) {
          return [
            { affectedRows: 1 },
            [],
          ];
        }

        return [[], []];
      },
      transaction: async (cb: any) => {
        return cb(mysqlClientMock);
      },
    };

    mysqlAdapter = new KnexDatabaseAdapter(mysqlClientMock);
    Database.setAdapter(mysqlAdapter, 'default');
  });

  afterEach(async () => {
    await Database.closeAll();
  });

  describe('MySQL - Dialect & Protocol Coverage', () => {
    it('identifies dialect as mysql2', () => {
      expect(mysqlAdapter.dialect).toBe('mysql2');
    });

    it('extracts insertId and affectedRows from MySQL ResultSetHeader packets', async () => {
      const res = await DB.table('users').insert({ name: 'MySQL Dev', role: 'developer' });
      expect(res.insertId).toBe(30);
      expect(res.affectedRows).toBe(1);

      // Verify no RETURNING clause generated in MySQL (only in PostgreSQL)
      const lastSql = executedSqlList[executedSqlList.length - 1]?.sql;
      expect(lastSql).not.toContain('RETURNING id');
    });

    it('normalizes MySQL [rows, fields] packets in QueryBuilder', async () => {
      const admins = await DB.table('users').where('role', 'admin').get();
      expect(admins).toHaveLength(1);
      expect(admins[0]?.name).toBe('MySQL Admin');
      expect(admins[0]?.balance).toBe(5000);
    });

    it('generates MySQL compliant pessimistic locks: FOR UPDATE and LOCK IN SHARE MODE', () => {
      const forUpdateSql = DB.table('users').where('id', 10).lockForUpdate().toSQL();
      expect(forUpdateSql.sql).toContain('FOR UPDATE');

      const sharedLockSql = DB.table('users').where('id', 10).sharedLock().toSQL();
      expect(sharedLockSql.sql).toContain('LOCK IN SHARE MODE');
    });

    it('supports MySQL Active Record Model persistence and relations', async () => {
      const user = await User.create({
        name: 'MySQL Active Entity',
        email: 'entity@mysql.org',
        role: 'admin',
      });

      expect(user.id).toBe(30);
      expect(user.name).toBe('MySQL Active Entity');

      // Update
      user.name = 'MySQL Active Entity Updated';
      await user.save();

      // Find
      const found = await User.find(10);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('MySQL Admin');
    });
  });
});
