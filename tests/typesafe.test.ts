import { describe, it, expect } from 'vitest';
import { Aero, AeroJS, Router, AeroContext, type ExtractRouteParams } from '../src/index.js';

describe('Phase 7: Type-Safe Routes and Enhanced urlFor', () => {
  it('exports AeroJS alias matching Aero class', () => {
    expect(AeroJS).toBe(Aero);
    const app = new AeroJS();
    expect(app).toBeInstanceOf(Aero);
  });
  it('extracts route parameter types statically', () => {
    type Params1 = ExtractRouteParams<'/users/:id'>;
    type Params2 = ExtractRouteParams<'/users/:userId/posts/:postId'>;
    type ParamsWildcard = ExtractRouteParams<'/files/*filePath'>;

    const p1: Params1 = { id: '123' };
    const p2: Params2 = { userId: '10', postId: '20' };
    const pWild: ParamsWildcard = { filePath: 'docs/test.pdf' };

    expect(p1.id).toBe('123');
    expect(p2.userId).toBe('10');
    expect(p2.postId).toBe('20');
    expect(pWild.filePath).toBe('docs/test.pdf');
  });

  it('supports typed AeroContext params', () => {
    type UserParams = { id: string };
    const ctx = new AeroContext<Record<string, unknown>, UserParams>(
      {} as any,
      {} as any
    );
    ctx.params = { id: 'user_99' };
    expect(ctx.params.id).toBe('user_99');
  });

  describe('Enhanced urlFor()', () => {
    it('generates URL for parameter routes', () => {
      const router = new Router();
      router.add('GET', '/users/:id', [() => {}], undefined, 'users.show');

      const url = router.urlFor('users.show', { id: '42' });
      expect(url).toBe('/users/42');
    });

    it('encodes URI components in parameters', () => {
      const router = new Router();
      router.add('GET', '/search/:query', [() => {}], undefined, 'search');

      const url = router.urlFor('search', { query: 'Node.js & Aero' });
      expect(url).toBe('/search/Node.js%20%26%20Aero');
    });

    it('resolves wildcard parameters', () => {
      const router = new Router();
      router.add('GET', '/static/*filePath', [() => {}], undefined, 'static');

      const url = router.urlFor('static', { filePath: 'images/logo.png' });
      expect(url).toBe('/static/images/logo.png');
    });

    it('appends unconsumed parameters as query string', () => {
      const router = new Router();
      router.add('GET', '/users/:id/posts', [() => {}], undefined, 'user.posts');

      const url = router.urlFor('user.posts', {
        id: 5,
        page: 2,
        sort: 'desc',
      });
      expect(url).toBe('/users/5/posts?page=2&sort=desc');
    });

    it('throws when required path parameter is missing', () => {
      const router = new Router();
      router.add('GET', '/teams/:teamId/members/:memberId', [() => {}], undefined, 'team.member');

      expect(() => {
        router.urlFor('team.member', { teamId: 'alpha' });
      }).toThrow(/Missing required route parameter 'memberId'/);
    });

    it('throws when named route does not exist', () => {
      const router = new Router();
      expect(() => {
        router.urlFor('nonexistent');
      }).toThrow(/Route with name 'nonexistent' not found/);
    });
  });
});
