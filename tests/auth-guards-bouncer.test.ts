import { describe, it, expect } from 'vitest';
import { ApiTokenGuard } from '../src/auth/guards/api-token-guard.js';
import { JwtGuard } from '../src/auth/guards/jwt-guard.js';
import { Bouncer, type PermissionStore, bouncerPlugin, bouncerManager } from '../src/auth/bouncer.js';
import { ForbiddenError, UnauthorizedError } from '../src/core/errors.js';

describe('Auth Guards & Bouncer Authorization', () => {
  describe('ApiTokenGuard', () => {
    it('generates, hashes and verifies API tokens', async () => {
      const generated = ApiTokenGuard.generate('aero_');
      expect(generated.plainToken.startsWith('aero_')).toBe(true);
      expect(generated.hashedToken).toBeDefined();

      const tokensDb: Record<string, any> = {
        [generated.hashedToken]: {
          id: 1,
          userId: 'usr_42',
          token: generated.hashedToken,
          name: 'CI Token',
          abilities: ['deploy', 'read'],
        },
      };

      const mockCtx: any = {
        req: {
          get: (header: string) => {
            if (header.toLowerCase() === 'authorization') {
              return `Bearer ${generated.plainToken}`;
            }
            return null;
          },
        },
      };

      let touched = false;
      const guard = new ApiTokenGuard(mockCtx, {
        findToken: async (hash) => tokensDb[hash] || null,
        findUser: async (id) => ({ id, role: 'developer' }),
        touchToken: async () => {
          touched = true;
        },
      });

      const user = await guard.authenticate();
      expect(user).not.toBeNull();
      expect(user?.id).toBe('usr_42');
      expect(guard.token()?.name).toBe('CI Token');
      expect(guard.can('deploy')).toBe(true);
      expect(guard.can('admin:write')).toBe(false);
      expect(guard.check()).toBe(true);
      expect(touched).toBe(true);
    });

    it('rejects revoked tokens', async () => {
      const generated = ApiTokenGuard.generate('aero_');
      const tokensDb: Record<string, any> = {
        [generated.hashedToken]: {
          id: 2,
          userId: 'usr_revoked',
          token: generated.hashedToken,
          name: 'Revoked Token',
          abilities: ['read'],
          revokedAt: new Date(),
        },
      };

      const mockCtx: any = {
        req: {
          get: () => `Bearer ${generated.plainToken}`,
        },
      };

      const guard = new ApiTokenGuard(mockCtx, {
        findToken: async (hash) => tokensDb[hash] || null,
        findUser: async (id) => ({ id, role: 'developer' }),
      });

      await expect(guard.authenticate()).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('JwtGuard', () => {
    const secret = 'super-secret-aerojs-key-at-least-32-chars!';

    it('signs and verifies JWT authentication tokens', async () => {
      const dummyCtx: any = { req: { get: () => null } };
      const guard = new JwtGuard(dummyCtx, {
        secret,
        expiresIn: '1h',
        provider: async (id) => ({ id, role: 'doctor' }),
      });

      const tokenPair = guard.generate({ id: 100, role: 'doctor' });
      expect(tokenPair.accessToken).toBeDefined();

      const authCtx: any = {
        req: {
          get: (h: string) => (h.toLowerCase() === 'authorization' ? `Bearer ${tokenPair.accessToken}` : null),
        },
      };

      const verifyGuard = new JwtGuard(authCtx, {
        secret,
        provider: async (id) => ({ id, role: 'doctor' }),
      });

      const authedUser = await verifyGuard.authenticate();
      expect(authedUser).not.toBeNull();
      expect(String(authedUser?.id)).toBe('100');
      expect(verifyGuard.check()).toBe(true);
    });
  });

  describe('Bouncer (RBAC & Policy Engine)', () => {
    const store: PermissionStore = {
      getRoles: async (userId) => (userId === 1 ? ['admin', 'manager'] : ['user']),
      getPermissions: async (userId) => (userId === 1 ? ['billing:refund', 'billing:view'] : ['billing:view']),
    };

    it('checks roles and abilities correctly', async () => {
      const bouncerAdmin = new Bouncer({ id: 1 }, store);
      expect(await bouncerAdmin.is('admin')).toBe(true);
      expect(await bouncerAdmin.is('superadmin')).toBe(false);
      expect(await bouncerAdmin.isAny(['superadmin', 'manager'])).toBe(true);
      expect(await bouncerAdmin.can('billing:refund')).toBe(true);
      expect(await bouncerAdmin.cannot('billing:delete')).toBe(true);

      const bouncerUser = new Bouncer({ id: 2 }, store);
      expect(await bouncerUser.is('admin')).toBe(false);
      expect(await bouncerUser.can('billing:refund')).toBe(false);
      expect(await bouncerUser.can('billing:view')).toBe(true);

      await expect(bouncerUser.assertCan('billing:refund')).rejects.toThrow(ForbiddenError);
      await expect(bouncerUser.assertIs('admin')).rejects.toThrow(ForbiddenError);
    });

    it('authorizes using custom policy classes', async () => {
      class ArticlePolicy {
        public update(user: any, article: any) {
          return user.id === article.authorId;
        }
      }

      const bouncer = new Bouncer({ id: 5 });
      const myArticle = { id: 1, authorId: 5 };
      const otherArticle = { id: 2, authorId: 99 };

      await expect(bouncer.authorize(ArticlePolicy, 'update', myArticle)).resolves.toBeUndefined();
      await expect(bouncer.authorize(ArticlePolicy, 'update', otherArticle)).rejects.toThrow(ForbiddenError);
    });

    it('enforces branch-scoped access', async () => {
      const userBranch1 = new Bouncer({ id: 10, branchId: 'branch_north' });
      await expect(userBranch1.assertBranch('branch_north')).resolves.toBeUndefined();
      await expect(userBranch1.assertBranch('branch_south')).rejects.toThrow(ForbiddenError);

      const adminUser = new Bouncer({ id: 1, role: 'admin', branchId: 'branch_north' });
      await expect(adminUser.assertBranch('branch_south')).resolves.toBeUndefined();
    });
  });
});
