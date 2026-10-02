import { describe, it, expect, beforeEach } from 'vitest';
import {
  DB,
  Model,
  Schema,
  Migrator,
  type Migration,
} from '../src/database/index.js';
import { NotFoundError } from '../src/core/errors.js';

// Define Sample Models for testing
class User extends Model {
  public static override table = 'users';
  public static override primaryKey = 'id';
  public static override hidden = ['password'];
  public static override softDeletes = true;

  public posts() {
    return this.hasMany(Post, 'user_id', 'id');
  }

  public profile() {
    return this.hasOne(Profile, 'user_id', 'id');
  }
}

class Post extends Model {
  public static override table = 'posts';

  public user() {
    return this.belongsTo(User, 'user_id', 'id');
  }
}

class Profile extends Model {
  public static override table = 'profiles';
}

describe('AeroJS Database & Active Record ORM (Step 1)', () => {
  beforeEach(async () => {
    // Reset database memory tables before each test
    await DB.closeAll();
  });

  describe('Fluent QueryBuilder', () => {
    it('supports insert, select, and where filtering', async () => {
      await DB.table('users').insert([
        { id: 1, name: 'Atif', role: 'admin', age: 28 },
        { id: 2, name: 'Alice', role: 'developer', age: 24 },
        { id: 3, name: 'Bob', role: 'designer', age: 32 },
      ]);

      const admins = await DB.table('users').where('role', 'admin').get();
      expect(admins).toHaveLength(1);
      expect(admins[0]?.name).toBe('Atif');

      const olderThan25 = await DB.table('users').where('age', '>', 25).get();
      expect(olderThan25).toHaveLength(2);

      const inRoles = await DB.table('users').whereIn('role', ['admin', 'designer']).get();
      expect(inRoles).toHaveLength(2);
    });

    it('supports orWhere, whereNull, and whereNotNull', async () => {
      await DB.table('items').insert([
        { id: 1, title: 'Item 1', deleted_at: null },
        { id: 2, title: 'Item 2', deleted_at: '2026-09-30' },
        { id: 3, title: 'Item 3', deleted_at: null },
      ]);

      const active = await DB.table('items').whereNull('deleted_at').get();
      expect(active).toHaveLength(2);

      const deleted = await DB.table('items').whereNotNull('deleted_at').get();
      expect(deleted).toHaveLength(1);

      const orMatches = await DB.table('items')
        .where('id', 1)
        .orWhere('id', 2)
        .get();
      expect(orMatches).toHaveLength(2);
    });

    it('supports orderBy, limit, offset, and pagination', async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        score: (i + 1) * 10,
      }));
      await DB.table('scores').insert(items);

      // Paginate page 1 (10 per page)
      const page1 = await DB.table('scores').orderBy('id', 'ASC').paginate(1, 10);
      expect(page1.total).toBe(25);
      expect(page1.data).toHaveLength(10);
      expect(page1.lastPage).toBe(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.data[0]?.id).toBe(1);

      // Paginate page 3 (last page with 5 items)
      const page3 = await DB.table('scores').paginate(3, 10);
      expect(page3.data).toHaveLength(5);
      expect(page3.hasMore).toBe(false);
    });

    it('compiles valid SQL and bindings via toSQL()', () => {
      const { sql, bindings } = DB.table('users')
        .select('id', 'name')
        .where('role', 'admin')
        .whereIn('status', ['active', 'pending'])
        .orderBy('created_at', 'DESC')
        .limit(10)
        .offset(20)
        .toSQL();

      expect(sql).toContain('SELECT id, name FROM users');
      expect(sql).toContain('WHERE role = ? AND status IN (?, ?)');
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).toContain('LIMIT 10 OFFSET 20');
      expect(bindings).toEqual(['admin', 'active', 'pending']);
    });

    it('supports update, delete, and count', async () => {
      await DB.table('users').insert({ id: 10, name: 'Old Name' });
      const updated = await DB.table('users').where('id', 10).update({ name: 'New Name' });
      expect(updated).toBe(1);

      const row = await DB.table('users').where('id', 10).first();
      expect(row?.name).toBe('New Name');

      const count = await DB.table('users').count();
      expect(count).toBe(1);

      const deleted = await DB.table('users').where('id', 10).delete();
      expect(deleted).toBe(1);
      expect(await DB.table('users').count()).toBe(0);
    });

    it('preserves builder state and supports concurrent first(), pluck(), and exists() via clone()', async () => {
      await DB.table('users').insert([
        { id: 21, name: 'Alice Alpha', role: 'admin' },
        { id: 22, name: 'Bob Beta', role: 'admin' },
        { id: 23, name: 'Charlie Gamma', role: 'user' },
      ]);

      const baseQuery = DB.table('users').where('role', 'admin');

      // Test clone explicitly
      const cloned = baseQuery.clone().where('name', 'Alice Alpha');
      expect(await cloned.count()).toBe(1);
      expect(await baseQuery.count()).toBe(2); // Original unmodified

      // Test concurrent executions without state corruption
      const [firstRec, doesExist, pluckedNames, allRows] = await Promise.all([
        baseQuery.first(),
        baseQuery.exists(),
        baseQuery.pluck('name'),
        baseQuery.get(),
      ]);

      expect(firstRec).toBeDefined();
      expect(doesExist).toBe(true);
      expect(pluckedNames).toEqual(['Alice Alpha', 'Bob Beta']);
      expect(allRows).toHaveLength(2);

      // Verify baseQuery did not permanently mutate columns or limit
      const { sql } = baseQuery.toSQL();
      expect(sql).toContain('SELECT * FROM users');
      expect(sql).not.toContain('LIMIT 1');

      // Clean up
      await DB.table('users').whereIn('id', [21, 22, 23]).delete();
    });
  });

  describe('Active Record Model (Eloquent / Lucid style)', () => {
    it('creates, saves, and mutates attributes directly via Proxy', async () => {
      const user = await User.create({
        name: 'Shohagh',
        email: 'shohagh@aero.org',
        password: 'hashed-secret-password',
      });

      expect(user.id).toBeDefined();
      expect(user.name).toBe('Shohagh');
      expect(user.email).toBe('shohagh@aero.org');
      expect(user.created_at).toBeDefined();

      // Mutate directly via proxy
      user.name = 'Shohagh Updated';
      await user.save();

      const refreshed = await User.find(user.id);
      expect(refreshed?.name).toBe('Shohagh Updated');
    });

    it('hides sensitive columns in toJSON()', async () => {
      const user = new User({
        id: 1,
        name: 'Alice',
        password: 'super-secret-password',
      });

      const json = user.toJSON();
      expect(json.name).toBe('Alice');
      expect(json.password).toBeUndefined();
    });

    it('handles findOrFail and throws NotFoundError if missing', async () => {
      await expect(User.findOrFail(9999)).rejects.toThrow(NotFoundError);
    });

    it('supports firstOrCreate', async () => {
      const u1 = await User.firstOrCreate({ email: 'first@aero.org' }, { name: 'First User' });
      expect(u1.name).toBe('First User');

      // Second call finds existing
      const u2 = await User.firstOrCreate({ email: 'first@aero.org' }, { name: 'Ignored' });
      expect(u2.id).toBe(u1.id);
      expect(u2.name).toBe('First User');
    });

    it('supports Soft Deletes (delete, restore, forceDelete, withTrashed, onlyTrashed)', async () => {
      const user = await User.create({ name: 'Temporary User' });
      const id = user.id;

      // Soft delete
      await user.delete();
      expect(user.deleted_at).toBeDefined();

      // Regular query excludes soft-deleted
      const normalLookup = await User.find(id);
      expect(normalLookup).toBeNull();

      // withTrashed includes it
      const withTrashed = await User.query().withTrashed().where('id', id).first();
      expect(withTrashed).not.toBeNull();

      // onlyTrashed returns it
      const onlyTrashed = await User.query().onlyTrashed().where('id', id).first();
      expect(onlyTrashed).not.toBeNull();

      // Restore
      await user.restore();
      const restoredLookup = await User.find(id);
      expect(restoredLookup).not.toBeNull();

      // Force Delete
      await user.forceDelete();
      const afterForce = await User.query().withTrashed().where('id', id).first();
      expect(afterForce).toBeNull();
    });

    it('supports Relationships and Eager Loading (solves N+1 queries)', async () => {
      // Seed users and posts
      const u1 = await User.create({ id: 1, name: 'Author One' });
      const u2 = await User.create({ id: 2, name: 'Author Two' });

      await Post.create({ id: 101, user_id: 1, title: 'Aero Post 1' });
      await Post.create({ id: 102, user_id: 1, title: 'Aero Post 2' });
      await Post.create({ id: 103, user_id: 2, title: 'Adonis Comparison' });

      await Profile.create({ id: 201, user_id: 1, bio: 'Lead Architect' });

      // Direct asynchronous relation invocation
      const u1Posts = await u1.posts();
      expect(u1Posts).toHaveLength(2);

      const p1 = await Post.find(101);
      const postUser = await p1?.user();
      expect(postUser?.name).toBe('Author One');

      // EAGER LOADING with .with('posts', 'profile')
      const usersWithRelations = await User.query()
        .with('posts', 'profile')
        .get();

      expect(usersWithRelations).toHaveLength(2);

      const author1 = usersWithRelations.find((u: any) => u.id === 1);
      expect(author1.posts).toHaveLength(2);
      expect(author1.posts[0].title).toBe('Aero Post 1');
      expect(author1.profile.bio).toBe('Lead Architect');

      // Serialization includes loaded relations
      const author1Json = author1.toJSON();
      expect(author1Json.posts).toHaveLength(2);
      expect(author1Json.profile.bio).toBe('Lead Architect');
    });
  });

  describe('Schema Builder & Migrator', () => {
    it('creates table blueprint and executes schema definitions', async () => {
      await Schema.createTable('articles', (table) => {
        table.increments('id');
        table.string('title', 200);
        table.text('content');
        table.boolean('is_published').defaultTo(false);
        table.timestamps();
      });

      // Insert and retrieve from created table
      await DB.table('articles').insert({
        title: 'Built-in Schema',
        content: 'Zero dependencies!',
      });

      const article = await DB.table('articles').first();
      expect(article?.title).toBe('Built-in Schema');
      expect(article?.is_published).toBe(false);

      await Schema.dropTableIfExists('articles');
    });

    it('runs migrations and rollbacks in batches via Migrator', async () => {
      const migrator = new Migrator();

      const migration1: Migration = {
        up: async () => {
          await Schema.createTable('tasks', (table) => {
            table.increments('id');
            table.string('name');
          });
        },
        down: async () => {
          await Schema.dropTableIfExists('tasks');
        },
      };

      const migration2: Migration = {
        up: async () => {
          await Schema.createTable('tags', (table) => {
            table.increments('id');
            table.string('label');
          });
        },
        down: async () => {
          await Schema.dropTableIfExists('tags');
        },
      };

      // 1. Run Migrations Batch 1
      const ran = await migrator.runMigrations([
        { name: '2026_09_30_000001_create_tasks', migration: migration1 },
        { name: '2026_09_30_000002_create_tags', migration: migration2 },
      ]);

      expect(ran).toHaveLength(2);
      expect(await migrator.getExecutedMigrations()).toHaveLength(2);

      // Re-running does not re-execute
      const ranAgain = await migrator.runMigrations([
        { name: '2026_09_30_000001_create_tasks', migration: migration1 },
      ]);
      expect(ranAgain).toHaveLength(0);

      // 2. Rollback Batch 1
      const rolledBack = await migrator.rollback({
        '2026_09_30_000001_create_tasks': migration1,
        '2026_09_30_000002_create_tags': migration2,
      });

      expect(rolledBack).toHaveLength(2);
      expect(await migrator.getExecutedMigrations()).toHaveLength(0);
    });
  });
});
