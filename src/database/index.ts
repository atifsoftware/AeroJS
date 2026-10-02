/**
 * @file index.ts
 * @description AeroJS Database & Active Record ORM Layer.
 */

export {
  Database,
  DB,
  MemoryDatabaseAdapter,
  type DatabaseAdapter,
  type DatabaseRow,
} from './connection.js';

export {
  QueryBuilder,
  type WhereClause,
  type JoinClause,
  type PaginationResult,
} from './query-builder.js';

export {
  Model,
  Relation,
  computed,
  encrypted,
  type RelationDefinition,
  type ManyToManyOptions,
  type HasManyThroughOptions,
} from './model.js';

export {
  getHookRegistry,
  registerHook,
  ModelHookRegistry,
  beforeCreate,
  afterCreate,
  beforeSave,
  afterSave,
  beforeUpdate,
  afterUpdate,
  beforeDelete,
  afterDelete,
  beforeFind,
  afterFind,
  beforeFetch,
  afterFetch,
  type ModelHookEvent,
  type ModelHookHandler,
} from './model-hooks.js';

export {
  Schema,
  TableBlueprint,
  type ColumnDefinition,
} from './schema.js';

export {
  Migrator,
  type Migration,
} from './migrator.js';

export {
  Seeder,
  DatabaseSeeder,
} from './seeder.js';

export {
  ModelFactory,
  type FactoryDefinition,
} from './factory.js';

export {
  KnexDatabaseAdapter,
  useKnex,
} from './knex.js';

export {
  usePrisma,
  type PrismaIntegrationOptions,
} from './prisma.js';

export {
  useDrizzle,
} from './drizzle.js';
