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
  type RelationDefinition,
} from './model.js';

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
  KnexDatabaseAdapter,
  useKnex,
} from './knex.js';
