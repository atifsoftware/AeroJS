/**
 * @file model.ts
 * @description Eloquent / Lucid-style Active Record ORM for AeroJS.
 * Features auto-wiring proxies, relationships (hasMany, belongsTo, hasOne),
 * eager loading (N+1 query solution), soft deletes, lifecycle hooks, and serialization.
 */

import { Database, type DatabaseRow } from './connection.js';
import { QueryBuilder } from './query-builder.js';
import { NotFoundError } from '../core/errors.js';

export interface RelationDefinition {
  type: 'hasMany' | 'hasOne' | 'belongsTo';
  RelatedModel: typeof Model | any;
  foreignKey: string;
  localKey: string;
  parentInstance: Model;
}

export class Relation implements PromiseLike<any> {
  public type: 'hasMany' | 'hasOne' | 'belongsTo';
  public RelatedModel: typeof Model | any;
  public foreignKey: string;
  public localKey: string;
  public parentInstance: Model;

  constructor(
    type: 'hasMany' | 'hasOne' | 'belongsTo',
    RelatedModel: typeof Model | any,
    foreignKey: string,
    localKey: string,
    parentInstance: Model
  ) {
    this.type = type;
    this.RelatedModel = RelatedModel;
    this.foreignKey = foreignKey;
    this.localKey = localKey;
    this.parentInstance = parentInstance;
  }

  public async then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      let result: any;
      const qb = this.RelatedModel.query();

      if (this.type === 'belongsTo') {
        const foreignVal = this.parentInstance.get(this.foreignKey);
        if (foreignVal === undefined || foreignVal === null) {
          result = null;
        } else {
          result = await qb.where(this.localKey, foreignVal).first();
        }
      } else {
        const localValue = this.parentInstance.get(this.localKey);
        if (localValue === undefined || localValue === null) {
          result = this.type === 'hasMany' ? [] : null;
        } else {
          if (this.type === 'hasMany') {
            result = await qb.where(this.foreignKey, localValue).get();
          } else {
            result = await qb.where(this.foreignKey, localValue).first();
          }
        }
      }
      return onfulfilled ? onfulfilled(result) : result;
    } catch (err) {
      if (onrejected) return onrejected(err);
      throw err;
    }
  }
}

/**
 * Aero Active Record Model Base Class
 */
export class Model {
  public static table = '';
  public static primaryKey = 'id';
  public static hidden: string[] = [];
  public static fillable: string[] = [];
  public static softDeletes = false;
  public static connection = 'default';

  public _attributes: Record<string, any>;
  public _original: Record<string, any>;
  public _exists = false;
  public _relations: Record<string, any> = {};
  [key: string]: any;

  constructor(attributes: Record<string, any> = {}) {
    this._attributes = {};
    this._original = {};
    this._exists = false;
    this._relations = {};

    this.fill(attributes);

    // Return Proxy so properties can be accessed and mutated directly: user.email = '...'
    return new Proxy(this, {
      get(target: any, prop: string | symbol, receiver: any) {
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver);
        }
        if (target._relations && prop in target._relations) {
          return target._relations[prop];
        }
        if (prop in target) {
          const val = Reflect.get(target, prop, receiver);
          if (typeof val === 'function' && prop !== 'constructor') {
            return val.bind(target);
          }
          return val;
        }
        return target.get(String(prop));
      },
      set(target: any, prop: string | symbol, value: any, receiver: any) {
        if (typeof prop === 'symbol') {
          return Reflect.set(target, prop, value, receiver);
        }
        if (prop in target && !['_attributes', '_original', '_relations', '_exists'].includes(String(prop))) {
          const desc = Object.getOwnPropertyDescriptor(target, prop) ||
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), prop);
          if (desc && (desc.get || desc.set)) {
            return Reflect.set(target, prop, value, receiver);
          }
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
    this._attributes[key] = value;
    return this;
  }

  public getAttributes(): Record<string, any> {
    return { ...this._attributes };
  }

  public static getTable(): string {
    if (this.table) return this.table;
    const name = this.name || 'Model';
    // Snake case and pluralize
    const snake = name.replace(/([A-Z])/g, (m, p1, offset) => {
      return offset > 0 ? '_' + p1.toLowerCase() : p1.toLowerCase();
    });
    return snake.endsWith('s') ? snake : `${snake}s`;
  }

  /**
   * HasMany Relationship
   */
  public hasMany(RelatedModel: typeof Model | any, foreignKey?: string, localKey?: string): Relation {
    const fk = foreignKey || `${this.constructor.name.toLowerCase()}_id`;
    const lk = localKey || (this.constructor as typeof Model).primaryKey;
    return new Relation('hasMany', RelatedModel, fk, lk, this);
  }

  /**
   * BelongsTo Relationship
   */
  public belongsTo(RelatedModel: typeof Model | any, foreignKey?: string, ownerKey?: string): Relation {
    const fk = foreignKey || `${RelatedModel.name.toLowerCase()}_id`;
    const ok = ownerKey || RelatedModel.primaryKey;
    return new Relation('belongsTo', RelatedModel, fk, ok, this);
  }

  /**
   * HasOne Relationship
   */
  public hasOne(RelatedModel: typeof Model | any, foreignKey?: string, localKey?: string): Relation {
    const fk = foreignKey || `${this.constructor.name.toLowerCase()}_id`;
    const lk = localKey || (this.constructor as typeof Model).primaryKey;
    return new Relation('hasOne', RelatedModel, fk, lk, this);
  }

  /**
   * Starts a Model QueryBuilder with eager-loading and soft-deletes applied.
   */
  public static query(): any {
    const table = this.getTable();
    const qb = Database.table(table, this.connection) as any;
    const ModelClass = this;

    qb._eagerLoads = [];
    qb._withTrashed = false;
    qb._onlyTrashed = false;

    qb.with = (...relations: string[]) => {
      qb._eagerLoads.push(...relations);
      return qb;
    };

    qb.preload = (...relations: string[]) => qb.with(...relations);

    qb.withTrashed = () => {
      qb._withTrashed = true;
      return qb;
    };

    qb.onlyTrashed = () => {
      qb._onlyTrashed = true;
      return qb;
    };

    const originalGet = qb.get.bind(qb);
    const originalFirst = qb.first.bind(qb);

    const applySoftDeleteFilter = () => {
      if (ModelClass.softDeletes) {
        if (qb._onlyTrashed) {
          qb.whereNotNull('deleted_at');
        } else if (!qb._withTrashed) {
          qb.whereNull('deleted_at');
        }
      }
    };

    qb.get = async (): Promise<Model[]> => {
      applySoftDeleteFilter();
      const rows = await originalGet();
      const instances = rows.map((r: any) => {
        const inst = new ModelClass(r);
        inst._exists = true;
        inst._original = { ...r };
        return inst;
      });

      // Eager Load Relations (solves N+1 query problem)
      if (qb._eagerLoads.length > 0 && instances.length > 0) {
        for (const relationName of qb._eagerLoads) {
          await ModelClass.eagerLoadRelation(instances, relationName);
        }
      }

      return instances;
    };

    qb.first = async (): Promise<Model | null> => {
      const prevLimit = qb.limitCount;
      qb.limitCount = 1;
      const rows = await qb.get();
      qb.limitCount = prevLimit;
      return rows[0] || null;
    };

    return qb;
  }

  /**
   * Internal Eager Loader to resolve relations in bulk
   */
  public static async eagerLoadRelation(instances: Model[], relationName: string): Promise<void> {
    if (instances.length === 0) return;
    const sample = instances[0]!;
    if (typeof sample[relationName] !== 'function') return;

    const relation: Relation = sample[relationName]();

    if (relation.type === 'belongsTo') {
      const foreignKeys = instances
        .map((i) => i.get(relation.foreignKey))
        .filter((k) => k !== null && k !== undefined);

      if (foreignKeys.length === 0) {
        for (const inst of instances) {
          inst._relations[relationName] = null;
        }
        return;
      }

      const relatedRows: Model[] = await relation.RelatedModel.query()
        .whereIn(relation.localKey, foreignKeys)
        .get();

      for (const inst of instances) {
        const foreignVal = inst.get(relation.foreignKey);
        inst._relations[relationName] =
          relatedRows.find((r) => r.get(relation.localKey) === foreignVal) || null;
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

      // Map related records to parent instances
      for (const inst of instances) {
        const parentVal = inst.get(relation.localKey);
        if (relation.type === 'hasMany') {
          inst._relations[relationName] = relatedRows.filter(
            (r) => r.get(relation.foreignKey) === parentVal
          );
        } else {
          inst._relations[relationName] =
            relatedRows.find((r) => r.get(relation.foreignKey) === parentVal) || null;
        }
      }
    }
  }

  public static async find(id: number | string): Promise<Model | null> {
    return this.query().where(this.primaryKey, id).first();
  }

  public static async findOrFail(id: number | string): Promise<Model> {
    const inst = await this.find(id);
    if (!inst) {
      throw new NotFoundError(`${this.name} with id ${id} not found`);
    }
    return inst;
  }

  public static async findBy(column: string, value: unknown): Promise<Model | null> {
    return this.query().where(column, value).first();
  }

  public static async all(): Promise<Model[]> {
    return this.query().get();
  }

  public static async create(attributes: Record<string, any>): Promise<Model> {
    const instance = new this(attributes);
    await instance.save();
    return instance;
  }

  public static async firstOrCreate(
    search: Record<string, any>,
    attributes: Record<string, any> = {}
  ): Promise<Model> {
    let q = this.query();
    for (const [k, v] of Object.entries(search)) {
      q = q.where(k, v);
    }
    const found = await q.first();
    if (found) return found;

    return this.create({ ...search, ...attributes });
  }

  /**
   * Save the current model instance (Insert or Update)
   */
  public async save(): Promise<this> {
    const Ctor = this.constructor as typeof Model;
    const pk = Ctor.primaryKey;
    const table = Ctor.getTable();

    await this.beforeSave();

    if (!this._exists) {
      await this.beforeCreate();
      if (!this._attributes['created_at']) {
        this._attributes['created_at'] = new Date().toISOString();
      }
      if (!this._attributes['updated_at']) {
        this._attributes['updated_at'] = new Date().toISOString();
      }

      const res = await Database.table(table, Ctor.connection).insert(this._attributes);
      if (res.insertId && !this._attributes[pk]) {
        this._attributes[pk] = res.insertId;
      }
      this._exists = true;
      this._original = { ...this._attributes };
      await this.afterCreate();
    } else {
      this._attributes['updated_at'] = new Date().toISOString();
      const id = this._attributes[pk];
      await Database.table(table, Ctor.connection).where(pk, id).update(this._attributes);
      this._original = { ...this._attributes };
    }

    await this.afterSave();
    return this;
  }

  /**
   * Delete the model instance (Soft Delete or Hard Delete)
   */
  public async delete(): Promise<boolean> {
    if (!this._exists) return false;
    const Ctor = this.constructor as typeof Model;
    const pk = Ctor.primaryKey;
    const id = this._attributes[pk];

    await this.beforeDelete();

    if (Ctor.softDeletes) {
      const now = new Date().toISOString();
      this.set('deleted_at', now);
      await Database.table(Ctor.getTable(), Ctor.connection).where(pk, id).update({ deleted_at: now });
    } else {
      await Database.table(Ctor.getTable(), Ctor.connection).where(pk, id).delete();
      this._exists = false;
    }

    await this.afterDelete();
    return true;
  }

  /**
   * Restore a soft-deleted model instance
   */
  public async restore(): Promise<boolean> {
    const Ctor = this.constructor as typeof Model;
    if (!Ctor.softDeletes || !this._exists) return false;

    const pk = Ctor.primaryKey;
    const id = this._attributes[pk];
    this.set('deleted_at', null);
    await Database.table(Ctor.getTable(), Ctor.connection).where(pk, id).update({ deleted_at: null });
    return true;
  }

  /**
   * Permanently delete a model instance from the database
   */
  public async forceDelete(): Promise<boolean> {
    if (!this._exists) return false;
    const Ctor = this.constructor as typeof Model;
    const pk = Ctor.primaryKey;
    const id = this._attributes[pk];

    await Database.table(Ctor.getTable(), Ctor.connection).where(pk, id).delete();
    this._exists = false;
    return true;
  }

  /**
   * Convert model instance to JSON object, stripping hidden attributes
   */
  public toJSON(): Record<string, any> {
    const Ctor = this.constructor as typeof Model;
    const json: Record<string, any> = {};

    for (const [key, val] of Object.entries(this._attributes)) {
      if (!Ctor.hidden.includes(key)) {
        json[key] = val;
      }
    }

    // Attach loaded relations
    for (const [rel, val] of Object.entries(this._relations)) {
      if (Array.isArray(val)) {
        json[rel] = val.map((item) => (item?.toJSON ? item.toJSON() : item));
      } else if (val?.toJSON) {
        json[rel] = val.toJSON();
      } else {
        json[rel] = val;
      }
    }

    return json;
  }

  // Lifecycle hook extension points
  public async beforeCreate(): Promise<void> {}
  public async afterCreate(): Promise<void> {}
  public async beforeSave(): Promise<void> {}
  public async afterSave(): Promise<void> {}
  public async beforeDelete(): Promise<void> {}
  public async afterDelete(): Promise<void> {}
}

export default Model;
