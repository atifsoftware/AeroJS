/**
 * @file bouncer.ts
 * @description RBAC Authorization Engine (Bouncer Pattern) for AeroJS.
 *
 * Supports:
 * - Role-based checks: ctx.bouncer.is('admin')
 * - Ability checks: ctx.bouncer.can('billing:approve-discount')
 * - Policy-based authorization: ctx.bouncer.authorize(DiscountPolicy, 'approve', discount)
 * - Data-scoped checks: enforcing branch-level data isolation
 *
 * Enterprise use:
 *   - Role-based authorization matrix
 *   - Maker-Checker dual control for approvals and transactions
 *   - Branch-scoped or organization-scoped data access
 */

import type { AeroContext } from '../core/context.js';
import type { AuthUser } from '../auth/guards/guard.js';
import { ForbiddenError, UnauthorizedError } from '../core/errors.js';
import type { Middleware } from '../core/types.js';

// ─── Policy Interface ─────────────────────────────────────────────────────────

export interface PolicyContract {
  [action: string]: (user: AuthUser, ...args: any[]) => Promise<boolean> | boolean;
}

export type PolicyConstructor = new () => PolicyContract;

// ─── Permission/Role Store ────────────────────────────────────────────────────

export interface PermissionStore {
  /**
   * Returns all roles for a given user ID.
   * Example: ['member', 'editor', 'admin']
   */
  getRoles(userId: string | number): Promise<string[]>;

  /**
   * Returns all permission strings for a given user ID.
   * Example: ['billing:view', 'billing:create', 'discount:approve:5']
   */
  getPermissions(userId: string | number): Promise<string[]>;
}

// ─── Bouncer Core ─────────────────────────────────────────────────────────────

export class Bouncer {
  private user: AuthUser | null;
  private _roles: string[] | null = null;
  private _permissions: string[] | null = null;
  private store?: PermissionStore;
  private policies = new Map<string, PolicyContract>();

  constructor(user: AuthUser | null, store?: PermissionStore) {
    this.user = user;
    this.store = store;
  }

  /**
   * Lazily loads roles from the permission store.
   */
  private async loadRoles(): Promise<string[]> {
    if (this._roles !== null) return this._roles;
    if (!this.user || !this.store) {
      this._roles = this.user?.role ? [this.user.role as string] : [];
    } else {
      this._roles = await this.store.getRoles(this.user.id);
    }
    return this._roles;
  }

  /**
   * Lazily loads permissions from the permission store.
   */
  private async loadPermissions(): Promise<string[]> {
    if (this._permissions !== null) return this._permissions;
    if (!this.user || !this.store) {
      this._permissions = [];
    } else {
      this._permissions = await this.store.getPermissions(this.user.id);
    }
    return this._permissions;
  }

  /**
   * Check if the authenticated user has a specific role.
   *
   * @example
   * if (await ctx.bouncer.is('supervisor')) { ... }
   */
  public async is(role: string): Promise<boolean> {
    if (!this.user) return false;
    const roles = await this.loadRoles();
    return roles.includes(role);
  }

  /**
   * Check if the user has any of the given roles.
   *
   * @example
   * if (await ctx.bouncer.isAny(['ms', 'director', 'ceo'])) { ... }
   */
  public async isAny(roles: string[]): Promise<boolean> {
    if (!this.user) return false;
    const userRoles = await this.loadRoles();
    return roles.some((r) => userRoles.includes(r));
  }

  /**
   * Check if the user has a specific permission.
   *
   * @example
   * if (await ctx.bouncer.can('billing:refund')) { ... }
   */
  public async can(permission: string): Promise<boolean> {
    if (!this.user) return false;
    const permissions = await this.loadPermissions();
    return permissions.includes('*') || permissions.includes(permission);
  }

  /**
   * Check if the user CANNOT perform an action.
   */
  public async cannot(permission: string): Promise<boolean> {
    return !(await this.can(permission));
  }

  /**
   * Enterprise approval check: Check approval authority threshold based on role.
   *
   * @example
   * if (!await ctx.bouncer.canApproveDiscount(12.5)) {
   *   ctx.throw(403, 'Discount exceeds your authority');
   * }
   */
  public async canApproveDiscount(percent: number): Promise<boolean> {
    if (!this.user) return false;
    const roles = await this.loadRoles();

    if (roles.includes('ceo') || roles.includes('director') || roles.includes('admin')) return true;
    if (roles.includes('manager') || roles.includes('lead')) return percent <= 15;
    if (roles.includes('supervisor')) return percent <= 5;
    return percent <= 0;
  }

  /**
   * Enterprise data scoping: Check if user belongs to a specific organizational branch or tenant.
   *
   * @example
   * await ctx.bouncer.assertBranch(resource.branchId);
   */
  public async assertBranch(resourceBranchId: string | number): Promise<void> {
    if (!this.user) throw new UnauthorizedError('Not authenticated');
    const roles = await this.loadRoles();

    // Head office roles can see all branches
    if (roles.includes('admin') || roles.includes('ceo') || roles.includes('director')) return;

    if (this.user.branchId && String(this.user.branchId) !== String(resourceBranchId)) {
      throw new ForbiddenError('Access denied: resource belongs to a different branch');
    }
  }

  /**
   * Policy-based authorization.
   * Instantiates the policy class and calls the named action method.
   *
   * @example
   * await ctx.bouncer.authorize(DiscountPolicy, 'approve', discount);
   * await ctx.bouncer.authorize(RefundPolicy, 'check', invoice);
   */
  public async authorize(
    PolicyClass: PolicyConstructor,
    action: string,
    ...args: any[]
  ): Promise<void> {
    if (!this.user) throw new UnauthorizedError('Not authenticated');

    const policyKey = PolicyClass.name;
    if (!this.policies.has(policyKey)) {
      this.policies.set(policyKey, new PolicyClass());
    }

    const policy = this.policies.get(policyKey)!;
    const method = policy[action];

    if (typeof method !== 'function') {
      throw new Error(`[AeroJS Bouncer] Policy "${policyKey}" does not define action "${action}"`);
    }

    const allowed = await method.call(policy, this.user, ...args);
    if (!allowed) {
      throw new ForbiddenError(`Not authorized to perform "${action}" action`);
    }
  }

  /**
   * Throws ForbiddenError if the user does NOT have the given role.
   */
  public async assertIs(role: string): Promise<void> {
    if (!(await this.is(role))) {
      throw new ForbiddenError(`Role "${role}" is required`);
    }
  }

  /**
   * Throws ForbiddenError if the user does NOT have the given permission.
   */
  public async assertCan(permission: string): Promise<void> {
    if (!(await this.can(permission))) {
      throw new ForbiddenError(`Permission "${permission}" is required`);
    }
  }
}

// ─── Bouncer Manager ──────────────────────────────────────────────────────────

export class BouncerManager {
  private store?: PermissionStore;

  public configure(store: PermissionStore): this {
    this.store = store;
    return this;
  }

  public forUser(user: AuthUser | null): Bouncer {
    return new Bouncer(user, this.store);
  }
}

export const bouncerManager = new BouncerManager();

/**
 * Middleware that attaches ctx.bouncer to every request.
 * Should be placed AFTER authPlugin so ctx.auth is available.
 *
 * @example
 * app.use(bouncerPlugin(bouncerManager));
 */
export function bouncerPlugin(manager: BouncerManager): Middleware {
  return async (ctx, next) => {
    const authCtx = (ctx as any).auth;
    const user = authCtx ? authCtx.user() : null;
    (ctx as any).bouncer = manager.forUser(user);
    await next();
  };
}

/**
 * Route-level middleware to require a specific role.
 *
 * @example
 * router.delete('/invoices/:id', handler).middleware(requireRole('supervisor'));
 */
export function requireRole(...roles: string[]): Middleware {
  return async (ctx, next) => {
    const bouncer = (ctx as any).bouncer as Bouncer;
    if (!bouncer) throw new Error('[AeroJS Bouncer] bouncerPlugin is not mounted');
    if (!(await bouncer.isAny(roles))) {
      throw new ForbiddenError(`Requires one of roles: ${roles.join(', ')}`);
    }
    await next();
  };
}

/**
 * Route-level middleware to require a specific permission.
 *
 * @example
 * router.post('/billing/refund', handler).middleware(requirePermission('billing:refund'));
 */
export function requirePermission(permission: string): Middleware {
  return async (ctx, next) => {
    const bouncer = (ctx as any).bouncer as Bouncer;
    if (!bouncer) throw new Error('[AeroJS Bouncer] bouncerPlugin is not mounted');
    await bouncer.assertCan(permission);
    await next();
  };
}
