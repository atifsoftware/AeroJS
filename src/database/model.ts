import { TenancyContext } from '../tenancy/tenant.js';
/**
 * @file model.ts
 * @description Lucid-inspired Active Record ORM for AeroJS. Completely rebuilt with:
 *
 *  ✅ EXISTING: hasOne, hasMany, belongsTo, softDelete, eager loading
 *  🆕 NEW: manyToMany (pivot table), hasManyThrough
 *  🆕 NEW: Static Lifecycle Hooks (@beforeSave, @afterCreate, etc.)
 *  🆕 NEW: Query Scopes (Model.query().active().byBranch(1))
 *  🆕 NEW: Computed Properties ($get prefix)
 *  🆕 NEW: $dirty tracking (know exactly what changed)
 *  🆕 NEW: $original + isDirty(field) helpers
 *
 * Examples:
 *   - User ↔ Role (manyToMany via user_roles)
 *   - Country → Users → Posts (hasManyThrough)
 *   - User.query().active().verified().byRole('admin').paginate(1, 20)
 *   - @beforeCreate() → generate UUID or reference code
 *   - @beforeDelete() → enforce audit retention policy
 */

import { Database, type DatabaseRow, type DatabaseAdapter } from './connection.js';
import { QueryBuilder } from './query-builder.js';
import { NotFoundError } from '../core/errors.js';
import { getHookRegistry } from './model-hooks.js';
import { Crypt } from '../security/encryption.js';

// ─── Relation Types ───────────────────────────────────────────────────────────

export interface RelationDefinition {
  type: 'hasMany' | 'hasOne' | 'belongsTo' | 'manyToMany' | 'hasManyThrough';
  RelatedModel: typeof Model | any;
  foreignKey: string;
  localKey: string;
  parentInstance: Model;
  // manyToMany
  pivotTable?: string;
  pivotForeignKey?: string;
  pivotRelatedKey?: string;
  pivotColumns?: string[];
  // hasManyThrough
  ThroughModel?: typeof Model | any;
  throughForeignKey?: string;
  throughLocalKey?: string;
}

// ─── ManyToMany Options ───────────────────────────────────────────────────────

export interface ManyToManyOptions {
  pivotTable?: string;
  pivotForeignKey?: string;
  pivotRelatedKey?: string;
  /** Extra pivot columns to include in the result (e.g. 'attached_at', 'role') */
  pivotColumns?: string[];
  localKey?: string;
  relatedKey?: string;
}

// ─── HasManyThrough Options ───────────────────────────────────────────────────

export interface HasManyThroughOptions {
  foreignKey?: string;      // FK on through model pointing to this model
  throughForeignKey?: string; // FK on target model pointing to through model
  localKey?: string;
  throughLocalKey?: string;
}

// ─── Relation Class ───────────────────────────────────────────────────────────

export class Relation implements PromiseLike<any> {
  public type: RelationDefinition['type'];
  public RelatedModel: typeof Model | any;
  public foreignKey: string;
  public localKey: string;
  public parentInstance: Model;
  public pivotTable?: string;
  public pivotForeignKey?: string;
  public pivotRelatedKey?: string;
  public pivotColumns?: string[];
  public ThroughModel?: typeof Model | any;
  public throughForeignKey?: string;
  public throughLocalKey?: string;

  constructor(def: RelationDefinition) {
    this.type = def.type;
    this.RelatedModel = def.RelatedModel;
    this.foreignKey = def.foreignKey;
    this.localKey = def.localKey;
    this.parentInstance = def.parentInstance;
    this.pivotTable = def.pivotTable;
    this.pivotForeignKey = def.pivotForeignKey;
    this.pivotRelatedKey = def.pivotRelatedKey;
    this.pivotColumns = def.pivotColumns;
    this.ThroughModel = def.ThroughModel;
    this.throughForeignKey = def.throughForeignKey;
    this.throughLocalKey = def.throughLocalKey;
  }

  public async then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = await this._resolve();
      return onfulfilled ? onfulfilled(result) : result;
    } catch (err) {
      if (onrejected) return onrejected(err);
      throw err;
    }
  }

  public async _resolve(): Promise<any> {
    const qb = this.RelatedModel.query();

    switch (this.type) {
      case 'belongsTo': {
        const foreignVal = this.parentInstance.get(this.foreignKey);
        if (foreignVal === undefined || foreignVal === null) return null;
        return qb.where(this.localKey, foreignVal).first();
      }
      case 'hasOne': {
        const localVal = this.parentInstance.get(this.localKey);
        if (localVal === undefined || localVal === null) return null;
        return qb.where(this.foreignKey, localVal).first();
      }
      case 'hasMany': {
        const localVal = this.parentInstance.get(this.localKey);
        if (localVal === undefined || localVal === null) return [];
        return qb.where(this.foreignKey, localVal).get();
      }
      case 'manyToMany': {
        return this._resolveManyToMany();
      }
      case 'hasManyThrough': {
        return this._resolveHasManyThrough();
      }
      default:
        return null;
    }
  }

  private async _resolveManyToMany(): Promise<any[]> {
    const localVal = this.parentInstance.get(this.localKey);
    if (localVal === undefined || localVal === null) return [];

    const pivotTable = this.pivotTable!;
    const pivotFK = this.pivotForeignKey!;
    const pivotRK = this.pivotRelatedKey!;
    const relatedTable = this.RelatedModel.getTable();
    const relatedPK = this.RelatedModel.primaryKey;
    const pivotExtra = this.pivotColumns ?? [];

    // SELECT related.*, pivot.col1, pivot.col2 FROM related
    // INNER JOIN pivot ON related.id = pivot.pivot_related_key
    // WHERE pivot.pivot_foreign_key = localVal
    const selectCols = [
      `${relatedTable}.*`,
      ...pivotExtra.map((c: string) => `${pivotTable}.${c} as pivot_${c}`),
    ];

    const rows = await Database.table(relatedTable)
      .select(...selectCols)
      .join(pivotTable, `${relatedTable}.${relatedPK}`, '=', `${pivotTable}.${pivotRK}`)
      .where(`${pivotTable}.${pivotFK}`, localVal)
      .get();

    return rows.map((r: any) => {
      const inst = new this.RelatedModel(r);
      inst._exists = true;
      inst._original = { ...r };
      // Attach pivot data
      if (pivotExtra.length > 0) {
        const pivot: Record<string, any> = {};
        for (const c of pivotExtra) {
          pivot[c] = r[`pivot_${c}`];
          delete inst._attributes[`pivot_${c}`];
        }
        inst._relations['$pivot'] = pivot;
      }
      return inst;
    });
  }

  private async _resolveHasManyThrough(): Promise<any[]> {
    const localVal = this.parentInstance.get(this.localKey);
    if (localVal === undefined || localVal === null) return [];

    const throughTable = this.ThroughModel!.getTable();
    const throughFK = this.throughForeignKey!;   // FK on through model → parent
    const throughLK = this.throughLocalKey!;     // FK on related model → through
    const relatedTable = this.RelatedModel.getTable();
    const relatedPK = this.RelatedModel.primaryKey;

    // SELECT related.* FROM related
    // INNER JOIN through ON related.through_fk = through.id
    // WHERE through.parent_fk = localVal
    const rows = await Database.table(relatedTable)
      .select(`${relatedTable}.*`)
      .join(throughTable, `${relatedTable}.${throughLK}`, '=', `${throughTable}.${this.ThroughModel!.primaryKey}`)
      .where(`${throughTable}.${throughFK}`, localVal)
      .get();

    return rows.map((r: any) => {
      const inst = new this.RelatedModel(r);
      inst._exists = true;
      inst._original = { ...r };
      return inst;
    });
  }
}

// ─── Computed Property Decorator ──────────────────────────────────────────────

/**
 * Marks a getter as a "computed property" — included in toJSON() output.
 * Computed properties are derived from other attributes (not stored in DB).
 *
 * @example
 * class User extends Model {
 *   @computed()
 *   get fullName(): string {
 *     return `${this.first_name} ${this.last_name}`;
 *   }
 * }
 */
export function computed(): PropertyDecorator {
  return function (target: any, propertyKey: string | symbol) {
    const ModelProto = target;
    if (!ModelProto._computedProperties) {
      ModelProto._computedProperties = [];
    }
    ModelProto._computedProperties.push(String(propertyKey));
  };
}

/**
 * Property decorator to mark a model attribute for transparent AES-256-GCM encryption in the database.
 * The attribute is stored encrypted in the database, but read and manipulated as plaintext in application code.
 *
 * @example
 * class AccountRecord extends Model {
 *   @encrypted()
 *   public ssn!: string;
 * }
 */
export function encrypted(): PropertyDecorator {
  return function (target: any, propertyKey: string | symbol) {
    const ctor = typeof target === 'function' ? target : target.constructor;
    if (!ctor.encrypted) {
      ctor.encrypted = [];
    }
    const propName = String(propertyKey);
    if (!ctor.encrypted.includes(propName)) {
      ctor.encrypted.push(propName);
    }

    Object.defineProperty(target, propertyKey, {
      get(this: Model) {
        return this.get(propName);
      },
      set(this: Model, val: any) {
        if (val === undefined && this.get(propName) !== null && this.get(propName) !== undefined) {
          // Avoid wiping out attributes initialized by constructor or hydration
          return;
        }
        this.set(propName, val);
      },
      enumerable: true,
      configurable: true,
    });
  };
}

// ─── Model Base Class ─────────────────────────────────────────────────────────

export class Model {
  // ── Static Configuration ────────────────────────────────────────────────────
  public static table = '';
  public static primaryKey = 'id';
  public static hidden: string[] = [];
  public static fillable: string[] = [];
  public static encrypted: string[] = [];
  public static tenanted = false;
  public static tenantColumn = 'tenant_id';
  public static softDeletes = false;
  public static timestamps: boolean | { createdAt?: string; updatedAt?: string } = true;
  public static connection = 'default';

  /**
   * Hydrates a database row into a Model instance, transparently decrypting any @encrypted fields.
   */
  public static hydrate<M extends Model = Model>(this: new (...args: any[]) => M, row: any): M {
    const Ctor = this as any;
    const decryptedRow = { ...row };
    if (Ctor.encrypted && Array.isArray(Ctor.encrypted) && Ctor.encrypted.length > 0) {
      for (const col of Ctor.encrypted) {
        if (decryptedRow[col] && Crypt.isEncrypted(decryptedRow[col])) {
          try {
            decryptedRow[col] = Crypt.decrypt(decryptedRow[col]);
          } catch {
            // Decryption fallback
          }
        }
      }
    }
    const inst = new (this as any)();
    inst._attributes = { ...decryptedRow };
    inst._exists = true;
    inst._original = { ...decryptedRow };
    inst._dirty = {};
    return inst;
  }

  /**
   * Global query scopes automatically applied to every query.
   *
   * @example
   * class User extends Model {
   *   public static override globalScopes = [TenantScope, ActiveScope];
   * }
   */
  public static globalScopes: Array<(qb: any, ctx?: any) => void> = [];

  // ── Instance State ──────────────────────────────────────────────────────────
  public _attributes: Record<string, any>;
  public _original: Record<string, any>;
  public _dirty: Record<string, boolean>;
  public _exists = false;
  public _relations: Record<string, any> = {};
  [key: string]: any;

  constructor(attributes: Record<string, any> = {}) {
    this._attributes = {};
    this._original = {};
    this._dirty = {};
    this._exists = false;
    this._relations = {};

    this.fill(attributes);

    return new Proxy(this, {
      get(target: any, prop: string | symbol, receiver: any) {
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
        if (target._relations && prop in target._relations) return target._relations[prop];

        // 1. If it's a model attribute, always return from _attributes
        if (target._attributes && String(prop) in target._attributes) {
          return target.get(String(prop));
        }

        // 2. Computed properties or custom prototype getters
        const protoDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), prop);
        if (protoDesc && protoDesc.get) {
          return protoDesc.get.call(receiver);
        }

        // 3. Methods or other properties
        if (prop in target) {
          const val = Reflect.get(target, prop, receiver);
          if (typeof val === 'function' && prop !== 'constructor') return val.bind(target);
          return val;
        }

        return target.get(String(prop));
      },
      set(target: any, prop: string | symbol, value: any, receiver: any) {
        if (typeof prop === 'symbol') return Reflect.set(target, prop, value, receiver);

        // Internal model state fields (_attributes, _exists, _original, _dirty, _relations)
        if (typeof prop === 'string' && prop.startsWith('_')) {
          target[prop] = value;
          return true;
        }

        const protoDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), prop);
        if (protoDesc && protoDesc.set && !(target._attributes && String(prop) in target._attributes)) {
          protoDesc.set.call(receiver, value);
          return true;
        }

        target.set(String(prop), value);
        return true;
      },
    });
  }

  public fill(attributes: Record<string, any>): this {
    const raw = attributes instanceof Model ? attributes.getAttributes() : attributes;
    const Ctor = this.constructor as typeof Model;
    for (const [key, value] of Object.entries(raw)) {
      if (Ctor.fillable.length === 0 || Ctor.fillable.includes(key)) {
        this._attributes[key] = value;
      }
    }
    return this;
  }

  public get(key: string): any {
    return this._attributes[key] !== undefined ? this._attributes[key] : null;
  }

  public set(key: string, value: any): this {
    if (this._exists && this._original[key] !== value) {
      this._dirty[key] = true;
    }
    this._attributes[key] = value;
    return this;
  }

  /** Returns true if the given field has changed since last save. */
  public isDirty(field?: string): boolean {
    if (field) return !!this._dirty[field];
    return Object.keys(this._dirty).length > 0;
  }

  /** Returns all changed attributes since last save. */
  public getDirty(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key of Object.keys(this._dirty)) {
      result[key] = this._attributes[key];
    }
    return result;
  }

  public getAttributes(): Record<string, any> {
    return { ...this._attributes };
  }

  public get attributes(): Record<string, any> {
    return this.getAttributes();
  }

  public static getTable(): string {
    if (this.table) return this.table;
    const name = this.name || 'Model';
    const snake = name.replace(/([A-Z])/g, (m, p1, offset) =>
      offset > 0 ? '_' + p1.toLowerCase() : p1.toLowerCase()
    );
    return snake.endsWith('s') ? snake : `${snake}s`;
  }

  // ─── Relationships ──────────────────────────────────────────────────────────

  public hasMany(RelatedModel: typeof Model | any, foreignKey?: string, localKey?: string): Relation {
    return new Relation({
      type: 'hasMany',
      RelatedModel,
      foreignKey: foreignKey || `${this.constructor.name.toLowerCase()}_id`,
      localKey: localKey || (this.constructor as typeof Model).primaryKey,
      parentInstance: this,
    });
  }

  public hasOne(RelatedModel: typeof Model | any, foreignKey?: string, localKey?: string): Relation {
    return new Relation({
      type: 'hasOne',
      RelatedModel,
      foreignKey: foreignKey || `${this.constructor.name.toLowerCase()}_id`,
      localKey: localKey || (this.constructor as typeof Model).primaryKey,
      parentInstance: this,
    });
  }

  public belongsTo(RelatedModel: typeof Model | any, foreignKey?: string, ownerKey?: string): Relation {
    return new Relation({
      type: 'belongsTo',
      RelatedModel,
      foreignKey: foreignKey || `${RelatedModel.name.toLowerCase()}_id`,
      localKey: ownerKey || RelatedModel.primaryKey,
      parentInstance: this,
    });
  }

  /**
   * ManyToMany Relationship via a pivot table.
   *
   * @example
   * // User ↔ Role (pivot: user_roles)
   * public roles() {
   *   return this.manyToMany(Role, {
   *     pivotTable: 'user_roles',
   *     pivotForeignKey: 'user_id',
   *     pivotRelatedKey: 'role_id',
   *     pivotColumns: ['assigned_at'], // extra pivot columns
   *   });
   * }
   *
   * // Article ↔ Tag (pivot: article_tags)
   * public tags() {
   *   return this.manyToMany(Tag, {
   *     pivotTable: 'article_tags',
   *     pivotForeignKey: 'article_id',
   *     pivotRelatedKey: 'tag_id',
   *   });
   * }
   */
  public manyToMany(
    RelatedModel: typeof Model | any,
    options: ManyToManyOptions = {}
  ): Relation {
    const Ctor = this.constructor as typeof Model;
    const thisName = Ctor.name.toLowerCase();
    const relatedName = RelatedModel.name.toLowerCase();
    const pivotTable = options.pivotTable ??
      [thisName, relatedName].sort().join('_') + 's';

    return new Relation({
      type: 'manyToMany',
      RelatedModel,
      foreignKey: options.localKey || Ctor.primaryKey,
      localKey: options.localKey || Ctor.primaryKey,
      parentInstance: this,
      pivotTable,
      pivotForeignKey: options.pivotForeignKey ?? `${thisName}_id`,
      pivotRelatedKey: options.pivotRelatedKey ?? `${relatedName}_id`,
      pivotColumns: options.pivotColumns ?? [],
    });
  }

  /**
   * HasManyThrough Relationship.
   *
   * @example
   * // Country has many Posts through Users
   * public posts() {
   *   return this.hasManyThrough(Post, User, {
   *     foreignKey: 'country_id',       // FK on User pointing to Country
   *     throughForeignKey: 'user_id',   // FK on Post pointing to User
   *   });
   * }
   *
   * // Organization has many Tasks through Projects
   * public tasks() {
   *   return this.hasManyThrough(Task, Project, {
   *     foreignKey: 'organization_id',
   *     throughForeignKey: 'project_id',
   *   });
   * }
   */
  public hasManyThrough(
    RelatedModel: typeof Model | any,
    ThroughModel: typeof Model | any,
    options: HasManyThroughOptions = {}
  ): Relation {
    const Ctor = this.constructor as typeof Model;
    const throughName = ThroughModel.name.toLowerCase();
    const relatedName = RelatedModel.name.toLowerCase();

    return new Relation({
      type: 'hasManyThrough',
      RelatedModel,
      ThroughModel,
      foreignKey: options.foreignKey ?? `${Ctor.name.toLowerCase()}_id`,
      localKey: options.localKey ?? Ctor.primaryKey,
      parentInstance: this,
      throughForeignKey: options.foreignKey ?? `${Ctor.name.toLowerCase()}_id`,
      throughLocalKey: options.throughForeignKey ?? `${throughName}_id`,
    });
  }

  // ─── ManyToMany Pivot Helpers ───────────────────────────────────────────────

  /**
   * Attach related records to the ManyToMany pivot table.
   *
   * @example
   * // Attach roles to user
   * await user.attach('roles', [1, 3, 5]);
   *
   * // Attach with pivot data (e.g. assigned_at date)
   * await user.attach('roles', { 1: { assigned_at: '2024-01-01' } });
   */
  public async attach(
    relationName: string,
    idsOrMap: number[] | string[] | Record<string | number, Record<string, any>>,
    connectionOrAdapter?: string | DatabaseAdapter
  ): Promise<void> {
    const rel = (this as any)[relationName]() as Relation;
    if (rel.type !== 'manyToMany') throw new Error(`attach() only works on manyToMany relations`);

    const Ctor = this.constructor as typeof Model;
    const localVal = this.get(Ctor.primaryKey);
    const conn = connectionOrAdapter || Ctor.connection;
    const table = rel.pivotTable!;

    const rows: Record<string, any>[] = [];

    if (Array.isArray(idsOrMap)) {
      for (const relatedId of idsOrMap) {
        rows.push({ [rel.pivotForeignKey!]: localVal, [rel.pivotRelatedKey!]: relatedId });
      }
    } else {
      for (const [relatedId, pivotData] of Object.entries(idsOrMap)) {
        rows.push({ [rel.pivotForeignKey!]: localVal, [rel.pivotRelatedKey!]: relatedId, ...pivotData });
      }
    }

    for (const row of rows) {
      await Database.table(table, conn).insert(row);
    }
  }

  /**
   * Detach related records from the ManyToMany pivot table.
   *
   * @example
   * await user.detach('roles', [3]); // detach specific
   * await user.detach('roles');       // detach all
   */
  public async detach(
    relationName: string,
    ids?: number[] | string[],
    connectionOrAdapter?: string | DatabaseAdapter
  ): Promise<void> {
    const rel = (this as any)[relationName]() as Relation;
    if (rel.type !== 'manyToMany') throw new Error(`detach() only works on manyToMany relations`);

    const Ctor = this.constructor as typeof Model;
    const localVal = this.get(Ctor.primaryKey);
    const conn = connectionOrAdapter || Ctor.connection;
    let qb = Database.table(rel.pivotTable!, conn).where(rel.pivotForeignKey!, localVal);

    if (ids && ids.length > 0) {
      qb = qb.whereIn(rel.pivotRelatedKey!, ids);
    }

    await qb.delete();
  }

  /**
   * Sync pivot table — detach all then re-attach.
   *
   * @example
   * // Sync user's roles (replaces all existing)
   * await user.sync('roles', [1, 3, 5]);
   */
  public async sync(
    relationName: string,
    idsOrMap: number[] | string[] | Record<string | number, Record<string, any>>,
    connectionOrAdapter?: string | DatabaseAdapter
  ): Promise<void> {
    await this.detach(relationName, undefined, connectionOrAdapter);
    await this.attach(relationName, idsOrMap, connectionOrAdapter);
  }

  // ─── Static Query Builder ───────────────────────────────────────────────────

  /**
   * Starts a model-level QueryBuilder with full support for:
   * - Eager loading (.with())
   * - Soft deletes (.withTrashed(), .onlyTrashed())
   * - Query scopes (.active(), .byBranch(), etc.)
   * - Global scopes (auto-applied)
   */
  public static query(connectionOrAdapter?: string | DatabaseAdapter): any {
    const table = this.getTable();
    const qb = Database.table(table, connectionOrAdapter || this.connection) as any;
    const ModelClass = this;

    // Apply multi-tenancy auto-scope
    if (this.tenanted) {
      const tenantId = TenancyContext.getStore();
      if (tenantId !== undefined) {
        qb.where(this.tenantColumn, tenantId);
      }
    }


    qb._eagerLoads = [];
    qb._withTrashed = false;
    qb._onlyTrashed = false;

    qb.with = (...relations: string[]) => {
      qb._eagerLoads.push(...relations);
      return qb;
    };

    qb.preload = (...relations: string[]) => qb.with(...relations);
    qb.withTrashed = () => { qb._withTrashed = true; return qb; };
    qb.onlyTrashed = () => { qb._onlyTrashed = true; return qb; };

    // ── Query Scope Binding ─────────────────────────────────────────────────
    // Auto-bind static scope methods: Model.scopeActive() → qb.active()
    const proto = ModelClass;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key.startsWith('scope') && typeof (proto as any)[key] === 'function') {
        const scopeName = key.charAt(5).toLowerCase() + key.slice(6); // scopeActive → active
        qb[scopeName] = (...args: any[]) => {
          (proto as any)[key](qb, ...args);
          return qb;
        };
      }
    }

    // ── Apply global scopes ─────────────────────────────────────────────────
    for (const scope of ModelClass.globalScopes) {
      scope(qb);
    }

    const applySoftDeleteFilter = () => {
      if (ModelClass.softDeletes) {
        if (qb._onlyTrashed) {
          qb.whereNotNull('deleted_at');
        } else if (!qb._withTrashed) {
          qb.whereNull('deleted_at');
        }
      }
    };

    const hydrateRow = (r: any): Model => {
      return ModelClass.hydrate(r);
    };

    const originalGet = qb.get.bind(qb);
    const originalFirst = qb.first.bind(qb);

    qb.get = async (): Promise<Model[]> => {
      applySoftDeleteFilter();

      // beforeFetch hook
      const registry = getHookRegistry(ModelClass);
      await registry.execute('beforeFetch', qb);

      const rows = await originalGet();
      const instances = rows.map(hydrateRow);

      // afterFetch hook
      await registry.execute('afterFetch', instances);

      // Eager Load
      if (qb._eagerLoads.length > 0 && instances.length > 0) {
        for (const relationName of qb._eagerLoads) {
          await ModelClass.eagerLoadRelation(instances, relationName);
        }
      }

      return instances;
    };

    qb.first = async (): Promise<Model | null> => {
      const prevLimit = qb.limitCount;
      try {
        qb.limitCount = 1;
        const rows = await qb.get();
        const inst = rows[0] || null;

        if (inst) {
          const registry = getHookRegistry(ModelClass);
          await registry.execute('afterFind', inst);
        }

        return inst;
      } finally {
        qb.limitCount = prevLimit;
      }
    };

    qb.firstOrFail = async (): Promise<Model> => {
      const inst = await qb.first();
      if (!inst) throw new NotFoundError(`${ModelClass.name} not found`);
      return inst;
    };

    return qb;
  }

  // ─── Eager Loading ──────────────────────────────────────────────────────────

  public static async eagerLoadRelation(instances: Model[], relationName: string): Promise<void> {
    if (instances.length === 0) return;
    const sample = instances[0]!;
    if (typeof sample[relationName] !== 'function') return;

    const relation: Relation = sample[relationName]();

    if (relation.type === 'manyToMany') {
      await this._eagerLoadManyToMany(instances, relationName, relation);
      return;
    }

    if (relation.type === 'hasManyThrough') {
      await this._eagerLoadHasManyThrough(instances, relationName, relation);
      return;
    }

    if (relation.type === 'belongsTo') {
      const foreignKeys = instances
        .map((i) => i.get(relation.foreignKey))
        .filter((k) => k !== null && k !== undefined);

      if (foreignKeys.length === 0) {
        for (const inst of instances) inst._relations[relationName] = null;
        return;
      }

      const relatedRows: Model[] = await relation.RelatedModel.query()
        .whereIn(relation.localKey, foreignKeys)
        .get();

      for (const inst of instances) {
        const fv = inst.get(relation.foreignKey);
        inst._relations[relationName] =
          relatedRows.find((r) => r.get(relation.localKey) === fv) || null;
      }
    } else {
      const parentKeys = instances
        .map((i) => i.get(relation.localKey))
        .filter((k) => k !== null && k !== undefined);

      if (parentKeys.length === 0) {
        for (const inst of instances) {
          inst._relations[relationName] = relation.type === 'hasMany' ? [] : null;
        }
        return;
      }

      const relatedRows: Model[] = await relation.RelatedModel.query()
        .whereIn(relation.foreignKey, parentKeys)
        .get();

      for (const inst of instances) {
        const pv = inst.get(relation.localKey);
        if (relation.type === 'hasMany') {
          inst._relations[relationName] = relatedRows.filter(
            (r) => r.get(relation.foreignKey) === pv
          );
        } else {
          inst._relations[relationName] =
            relatedRows.find((r) => r.get(relation.foreignKey) === pv) || null;
        }
      }
    }
  }

  private static async _eagerLoadManyToMany(
    instances: Model[],
    relationName: string,
    rel: Relation
  ): Promise<void> {
    const localKey = rel.localKey;
    const parentKeys = instances.map((i) => i.get(localKey)).filter((k) => k != null);
    if (parentKeys.length === 0) {
      for (const inst of instances) inst._relations[relationName] = [];
      return;
    }

    const relatedTable = rel.RelatedModel.getTable();
    const relatedPK = rel.RelatedModel.primaryKey;
    const pivotExtra = rel.pivotColumns ?? [];

    const selectCols = [
      `${relatedTable}.*`,
      `${rel.pivotTable}.${rel.pivotForeignKey} as __pivot_fk`,
      ...pivotExtra.map((c: string) => `${rel.pivotTable}.${c} as pivot_${c}`),
    ];

    const rows = await Database.table(relatedTable)
      .select(...selectCols)
      .join(rel.pivotTable!, `${relatedTable}.${relatedPK}`, '=', `${rel.pivotTable}.${rel.pivotRelatedKey}`)
      .whereIn(`${rel.pivotTable}.${rel.pivotForeignKey}`, parentKeys)
      .get();

    const map = new Map<any, any[]>();
    for (const inst of instances) {
      map.set(inst.get(localKey), []);
    }

    for (const row of rows as any[]) {
      const parentKey = row.__pivot_fk;
      const inst = new rel.RelatedModel(row);
      inst._exists = true;
      inst._original = { ...row };
      delete inst._attributes['__pivot_fk'];

      if (pivotExtra.length > 0) {
        const pivot: Record<string, any> = {};
        for (const c of pivotExtra) {
          pivot[c] = row[`pivot_${c}`];
          delete inst._attributes[`pivot_${c}`];
        }
        inst._relations['$pivot'] = pivot;
      }

      const list = map.get(parentKey);
      if (list) list.push(inst);
    }

    for (const inst of instances) {
      inst._relations[relationName] = map.get(inst.get(localKey)) ?? [];
    }
  }

  private static async _eagerLoadHasManyThrough(
    instances: Model[],
    relationName: string,
    rel: Relation
  ): Promise<void> {
    const parentKeys = instances.map((i) => i.get(rel.localKey)).filter((k) => k != null);
    if (parentKeys.length === 0) {
      for (const inst of instances) inst._relations[relationName] = [];
      return;
    }

    const relatedTable = rel.RelatedModel.getTable();
    const throughTable = rel.ThroughModel.getTable();

    const rows = await Database.table(relatedTable)
      .select(`${relatedTable}.*`, `${throughTable}.${rel.throughForeignKey} as __through_fk`)
      .join(throughTable, `${relatedTable}.${rel.throughLocalKey}`, '=', `${throughTable}.${rel.ThroughModel.primaryKey}`)
      .whereIn(`${throughTable}.${rel.throughForeignKey}`, parentKeys)
      .get();

    const map = new Map<any, any[]>();
    for (const inst of instances) map.set(inst.get(rel.localKey), []);

    for (const row of rows as any[]) {
      const parentKey = (row as any).__through_fk;
      const inst = new rel.RelatedModel(row);
      inst._exists = true;
      inst._original = { ...row };
      delete inst._attributes['__through_fk'];
      const list = map.get(parentKey);
      if (list) list.push(inst);
    }

    for (const inst of instances) {
      inst._relations[relationName] = map.get(inst.get(rel.localKey)) ?? [];
    }
  }

  // ─── Static Finders ─────────────────────────────────────────────────────────

  public static async find(id: number | string): Promise<Model | null> {
    return this.query().where(this.primaryKey, id).first();
  }

  public static async findOrFail(id: number | string): Promise<Model> {
    const inst = await this.find(id);
    if (!inst) throw new NotFoundError(`${this.name} with id ${id} not found`);
    return inst;
  }

  public static async findBy(column: string, value: unknown): Promise<Model | null> {
    return this.query().where(column, value).first();
  }

  public static async all(): Promise<Model[]> {
    return this.query().get();
  }

  public static where(column: string, operatorOrValue: unknown, value?: unknown): any {
    return this.query().where(column, operatorOrValue, value);
  }

  public static whereIn(column: string, values: unknown[]): any {
    return this.query().whereIn(column, values);
  }

  public static whereNotIn(column: string, values: unknown[]): any {
    return this.query().whereNotIn(column, values);
  }

  public static whereBetween(column: string, range: [unknown, unknown]): any {
    return this.query().whereBetween(column, range);
  }

  public static whereNotBetween(column: string, range: [unknown, unknown]): any {
    return this.query().whereNotBetween(column, range);
  }

  public static whereLike(column: string, pattern: string): any {
    return this.query().whereLike(column, pattern);
  }

  public static whereNull(column: string): any {
    return this.query().whereNull(column);
  }

  public static whereNotNull(column: string): any {
    return this.query().whereNotNull(column);
  }

  public static whereRaw(sql: string, bindings: unknown[] = []): any {
    return this.query().whereRaw(sql, bindings);
  }

  public static orderBy(column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC' = 'ASC'): any {
    return this.query().orderBy(column, direction);
  }

  public static limit(count: number): any {
    return this.query().limit(count);
  }

  public static async paginate(page = 1, perPage = 15): Promise<any> {
    return this.query().paginate(page, perPage);
  }

  public static with(...relations: string[]): any {
    return this.query().with(...relations);
  }

  public static preload(...relations: string[]): any {
    return this.query().preload(...relations);
  }

  public static async count(column = '*'): Promise<number> {
    return this.query().count(column);
  }

  public static async sum(column: string): Promise<number> {
    return this.query().sum(column);
  }

  public static async avg(column: string): Promise<number> {
    return this.query().avg(column);
  }

  public static async create(
    attributes: Record<string, any>,
    connectionOrAdapter?: string | DatabaseAdapter
  ): Promise<Model> {
    const instance = new this(attributes);
    await instance.save(connectionOrAdapter);
    return instance;
  }

  public static async firstOrCreate(
    search: Record<string, any>,
    attributes: Record<string, any> = {},
    connectionOrAdapter?: string | DatabaseAdapter
  ): Promise<Model> {
    let q = this.query(connectionOrAdapter);
    for (const [k, v] of Object.entries(search)) {
      q = q.where(k, v);
    }
    const found = await q.first();
    if (found) return found;
    return this.create({ ...search, ...attributes }, connectionOrAdapter);
  }

  /**
   * Update or create a record.
   *
   * @example
   * await User.updateOrCreate(
   *   { email: 'user@example.com' },
   *   { name: 'Rahim', phone: '01700000000' }
   * );
   */
  public static async updateOrCreate(
    search: Record<string, any>,
    attributes: Record<string, any>,
    connectionOrAdapter?: string | DatabaseAdapter
  ): Promise<Model> {
    let q = this.query(connectionOrAdapter);
    for (const [k, v] of Object.entries(search)) q = q.where(k, v);
    const found = await q.first() as Model | null;

    if (found) {
      found.fill(attributes);
      await found.save(connectionOrAdapter);
      return found;
    }
    return this.create({ ...search, ...attributes }, connectionOrAdapter);
  }

  // ─── Save / Delete ──────────────────────────────────────────────────────────

  public async save(connectionOrAdapter?: string | DatabaseAdapter): Promise<this> {
    const Ctor = this.constructor as typeof Model;
    const pk = Ctor.primaryKey;
    const table = Ctor.getTable();
    const conn = connectionOrAdapter || Ctor.connection;
    const registry = getHookRegistry(Ctor);

    await registry.execute('beforeSave', this);

    const formatSqlDate = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

    const toDatabaseAttributes = () => {
      const attrs = { ...this._attributes };
      if (Ctor.encrypted && Array.isArray(Ctor.encrypted) && Ctor.encrypted.length > 0) {
        for (const col of Ctor.encrypted) {
          const val = attrs[col];
          if (val !== undefined && val !== null && !Crypt.isEncrypted(val)) {
            attrs[col] = Crypt.encrypt(val);
          }
        }
      }
      return attrs;
    };

    if (!this._exists) {
      await registry.execute('beforeCreate', this);

      const createdCol = typeof Ctor.timestamps === 'object'
        ? (Ctor.timestamps.createdAt || null)
        : (Ctor.timestamps ? 'created_at' : null);
      const updatedCol = typeof Ctor.timestamps === 'object'
        ? (Ctor.timestamps.updatedAt || null)
        : (Ctor.timestamps ? 'updated_at' : null);

      if (createdCol && !this._attributes[createdCol]) this._attributes[createdCol] = formatSqlDate();
      if (updatedCol && !this._attributes[updatedCol]) this._attributes[updatedCol] = formatSqlDate();

      const res = await Database.table(table, conn).insert(toDatabaseAttributes());
      if (res.insertId && !this._attributes[pk]) this._attributes[pk] = res.insertId;
      this._exists = true;
      this._original = { ...this._attributes };
      this._dirty = {};

      await registry.execute('afterCreate', this);
    } else {
      await registry.execute('beforeUpdate', this);

      const updatedCol = typeof Ctor.timestamps === 'object'
        ? (Ctor.timestamps.updatedAt || null)
        : (Ctor.timestamps ? 'updated_at' : null);
      if (updatedCol) this._attributes[updatedCol] = formatSqlDate();

      const id = this._attributes[pk];
      await Database.table(table, conn).where(pk, id).update(toDatabaseAttributes());
      this._original = { ...this._attributes };
      this._dirty = {};

      await registry.execute('afterUpdate', this);
    }

    await registry.execute('afterSave', this);
    return this;
  }

  public async delete(connectionOrAdapter?: string | DatabaseAdapter): Promise<boolean> {
    if (!this._exists) return false;
    const Ctor = this.constructor as typeof Model;
    const pk = Ctor.primaryKey;
    const id = this._attributes[pk];
    const conn = connectionOrAdapter || Ctor.connection;
    const registry = getHookRegistry(Ctor);

    await registry.execute('beforeDelete', this);

    if (Ctor.softDeletes) {
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      this.set('deleted_at', now);
      await Database.table(Ctor.getTable(), conn).where(pk, id).update({ deleted_at: now });
    } else {
      await Database.table(Ctor.getTable(), conn).where(pk, id).delete();
      this._exists = false;
    }

    await registry.execute('afterDelete', this);
    return true;
  }

  public async restore(connectionOrAdapter?: string | DatabaseAdapter): Promise<boolean> {
    const Ctor = this.constructor as typeof Model;
    if (!Ctor.softDeletes || !this._exists) return false;
    const pk = Ctor.primaryKey;
    const id = this._attributes[pk];
    const conn = connectionOrAdapter || Ctor.connection;
    this.set('deleted_at', null);
    await Database.table(Ctor.getTable(), conn).where(pk, id).update({ deleted_at: null });
    return true;
  }

  public async forceDelete(connectionOrAdapter?: string | DatabaseAdapter): Promise<boolean> {
    if (!this._exists) return false;
    const Ctor = this.constructor as typeof Model;
    const pk = Ctor.primaryKey;
    const id = this._attributes[pk];
    const conn = connectionOrAdapter || Ctor.connection;
    await Database.table(Ctor.getTable(), conn).where(pk, id).delete();
    this._exists = false;
    return true;
  }

  // ─── Serialization ──────────────────────────────────────────────────────────

  /**
   * Converts the model to a plain JSON object.
   * Hidden attributes are excluded. Relations and computed properties are included.
   */
  public toJSON(): Record<string, any> {
    const Ctor = this.constructor as typeof Model;
    const json: Record<string, any> = {};

    for (const [key, val] of Object.entries(this._attributes)) {
      if (!Ctor.hidden.includes(key)) json[key] = val;
    }

    // Include eager-loaded relations
    for (const [rel, val] of Object.entries(this._relations)) {
      if (rel === '$pivot') continue; // handled separately
      if (Array.isArray(val)) {
        json[rel] = val.map((item) => (item?.toJSON ? item.toJSON() : item));
      } else if (val?.toJSON) {
        json[rel] = val.toJSON();
      } else {
        json[rel] = val;
      }
    }

    // Include computed properties (registered via @computed decorator)
    const computedProps: string[] = (Object.getPrototypeOf(this) as any)._computedProperties ?? [];
    for (const prop of computedProps) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), prop);
        if (descriptor?.get) {
          json[prop] = descriptor.get.call(this);
        }
      } catch {
        // Computed property threw — skip silently
      }
    }

    return json;
  }

  // ─── Instance Lifecycle Hooks (override-style, kept for backward compat) ────

  /** @deprecated Use @beforeSave() decorator or registerHook() instead */
  public async beforeCreate(): Promise<void> {}
  /** @deprecated Use @afterCreate() decorator or registerHook() instead */
  public async afterCreate(): Promise<void> {}
  /** @deprecated Use @beforeSave() decorator or registerHook() instead */
  public async beforeSave(): Promise<void> {}
  /** @deprecated Use @afterSave() decorator or registerHook() instead */
  public async afterSave(): Promise<void> {}
  /** @deprecated Use @beforeDelete() decorator or registerHook() instead */
  public async beforeDelete(): Promise<void> {}
  /** @deprecated Use @afterDelete() decorator or registerHook() instead */
  public async afterDelete(): Promise<void> {}
}

export default Model;
