/**
 * @file model-hooks.ts
 * @description Static Lifecycle Hook system for AeroJS Models. Inspired by @adonisjs/lucid's
 * @poppinss/hooks pattern. Supports multiple handlers per event, async execution,
 * decorator-based registration, and one-time hooks.
 *
 * Typical use-cases:
 *   @beforeSave()   → auto-hash password before saving
 *   @beforeCreate() → generate unique reference code or UUID
 *   @afterCreate()  → dispatch UserRegistered domain event or send welcome notification
 *   @beforeDelete() → block deletion or enforce soft-delete policy
 *   @afterUpdate()  → write immutable audit trail
 */

// ─── Hook Event Types ─────────────────────────────────────────────────────────

export type ModelHookEvent =
  | 'beforeCreate'
  | 'afterCreate'
  | 'beforeSave'
  | 'afterSave'
  | 'beforeUpdate'
  | 'afterUpdate'
  | 'beforeDelete'
  | 'afterDelete'
  | 'beforeFind'
  | 'afterFind'
  | 'beforeFetch'
  | 'afterFetch';

export type ModelHookHandler<T = any> = (instance: T) => Promise<void> | void;

// ─── Hook Registry ────────────────────────────────────────────────────────────

export class ModelHookRegistry {
  private handlers = new Map<ModelHookEvent, ModelHookHandler[]>();

  /**
   * Register a hook handler.
   */
  public add(event: ModelHookEvent, handler: ModelHookHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  /**
   * Execute all handlers for a given hook event in order.
   */
  public async execute(event: ModelHookEvent, instance: any): Promise<void> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;
    for (const handler of list) {
      await handler(instance);
    }
  }

  /**
   * Remove all handlers for a specific event.
   */
  public clear(event?: ModelHookEvent): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Returns a copy of all registered hooks (for inspection/testing).
   */
  public all(): Map<ModelHookEvent, ModelHookHandler[]> {
    return new Map(this.handlers);
  }
}

// ─── Per-class Hook Registry Store ───────────────────────────────────────────

const registryStore = new WeakMap<Function, ModelHookRegistry>();

/**
 * Gets or creates the ModelHookRegistry for a given Model class.
 */
export function getHookRegistry(ModelClass: Function): ModelHookRegistry {
  if (!registryStore.has(ModelClass)) {
    registryStore.set(ModelClass, new ModelHookRegistry());
  }
  return registryStore.get(ModelClass)!;
}

// ─── Decorator Factories ──────────────────────────────────────────────────────

/**
 * Creates a method decorator that registers the decorated static method
 * as a lifecycle hook handler.
 *
 * @example
 * class User extends Model {
 *   @beforeCreate()
 *   public static generateUuid(instance: User) {
 *     instance.uuid = crypto.randomUUID();
 *   }
 *
 *   @beforeSave()
 *   public static async hashPassword(instance: User) {
 *     if (instance.$dirty.password) {
 *       instance.password = await hash(instance.password);
 *     }
 *   }
 *
 *   @beforeDelete()
 *   public static enforceSoftDelete(_instance: User) {
 *     // Enforce soft-delete logic
 *   }
 * }
 */
function createHookDecorator(event: ModelHookEvent) {
  return function (): MethodDecorator {
    return function (target: any, _propertyKey: string | symbol, descriptor: PropertyDescriptor) {
      // target is the class itself for static methods
      const ModelClass = typeof target === 'function' ? target : target.constructor;
      const registry = getHookRegistry(ModelClass);
      registry.add(event, descriptor.value);
    };
  };
}

export const beforeCreate = createHookDecorator('beforeCreate');
export const afterCreate  = createHookDecorator('afterCreate');
export const beforeSave   = createHookDecorator('beforeSave');
export const afterSave    = createHookDecorator('afterSave');
export const beforeUpdate = createHookDecorator('beforeUpdate');
export const afterUpdate  = createHookDecorator('afterUpdate');
export const beforeDelete = createHookDecorator('beforeDelete');
export const afterDelete  = createHookDecorator('afterDelete');
export const beforeFind   = createHookDecorator('beforeFind');
export const afterFind    = createHookDecorator('afterFind');
export const beforeFetch  = createHookDecorator('beforeFetch');
export const afterFetch   = createHookDecorator('afterFetch');

// ─── Programmatic API (without decorators) ────────────────────────────────────

/**
 * Register a hook handler programmatically (no decorator needed).
 *
 * @example
 * // In server.ts or a service provider:
 * registerHook(Invoice, 'beforeDelete', async (invoice) => {
 *   await AuditTrail.log({ action: 'VOID', recordId: invoice.id });
 * });
 */
export function registerHook<T = any>(
  ModelClass: Function,
  event: ModelHookEvent,
  handler: ModelHookHandler<T>
): void {
  getHookRegistry(ModelClass).add(event, handler as ModelHookHandler);
}
