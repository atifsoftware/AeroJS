import { describe, it, expect } from 'vitest';
import { Router } from '../src/core/router.js';

describe('Router Engine', () => {
  it('matches static routes', () => {
    const router = new Router();
    const handler = () => {};
    router.add('GET', '/users', [handler]);

    const match = router.match('GET', '/users');
    expect(match).not.toBeNull();
    expect(match?.route.path).toBe('/users');
    expect(match?.params).toEqual({});
    expect(match?.handlers[0]).toBe(handler);
  });

  it('extracts single and multiple path parameters', () => {
    const router = new Router();
    router.add('GET', '/users/:id', [() => {}]);
    router.add('GET', '/users/:id/posts/:postId', [() => {}]);

    const singleMatch = router.match('GET', '/users/42');
    expect(singleMatch).not.toBeNull();
    expect(singleMatch?.params).toEqual({ id: '42' });

    const multiMatch = router.match('GET', '/users/99/posts/abc-123');
    expect(multiMatch).not.toBeNull();
    expect(multiMatch?.params).toEqual({ id: '99', postId: 'abc-123' });
  });

  it('extracts wildcard parameters', () => {
    const router = new Router();
    router.add('GET', '/static/*', [() => {}]);
    router.add('GET', '/files/*filePath', [() => {}]);

    const wildcard1 = router.match('GET', '/static/css/theme.css');
    expect(wildcard1).not.toBeNull();
    expect(wildcard1?.params).toEqual({ '*': 'css/theme.css' });

    const wildcard2 = router.match('GET', '/files/docs/report.pdf');
    expect(wildcard2).not.toBeNull();
    expect(wildcard2?.params).toEqual({ filePath: 'docs/report.pdf' });
  });

  it('normalizes trailing slashes', () => {
    const router = new Router();
    router.add('GET', '/profile/', [() => {}]);
    router.add('GET', '/dashboard', [() => {}]);

    expect(router.match('GET', '/profile')).not.toBeNull();
    expect(router.match('GET', '/profile/')).not.toBeNull();
    expect(router.match('GET', '/dashboard')).not.toBeNull();
    expect(router.match('GET', '/dashboard/')).not.toBeNull();
  });

  it('supports ALL method handler', () => {
    const router = new Router();
    router.add('ALL', '/webhook', [() => {}]);

    expect(router.match('GET', '/webhook')).not.toBeNull();
    expect(router.match('POST', '/webhook')).not.toBeNull();
    expect(router.match('DELETE', '/webhook')).not.toBeNull();
  });

  it('falls back HEAD to GET when no explicit HEAD route exists', () => {
    const router = new Router();
    router.add('GET', '/resource', [() => {}]);

    const headMatch = router.match('HEAD', '/resource');
    expect(headMatch).not.toBeNull();
    expect(headMatch?.route.method).toBe('GET');
  });

  it('detects existing paths for 405 Method Not Allowed via hasPath and allowedMethods', () => {
    const router = new Router();
    router.add('POST', '/login', [() => {}]);
    router.add('PUT', '/login', [() => {}]);

    expect(router.hasPath('/login')).toBe(true);
    expect(router.hasPath('/unknown')).toBe(false);

    expect(router.match('GET', '/login')).toBeNull();

    const allowed = router.allowedMethods('/login');
    expect(allowed).toContain('POST');
    expect(allowed).toContain('PUT');
    expect(allowed).toContain('OPTIONS');
  });

  it('supports named routes and urlFor()', () => {
    const router = new Router();
    router.add('GET', '/users/:id/posts/:postId', [() => {}], undefined, 'users.posts.show');

    const url = router.urlFor('users.posts.show', { id: 42, postId: 'post-1' });
    expect(url).toBe('/users/42/posts/post-1');

    expect(() => router.urlFor('missing')).toThrow("Route with name 'missing' not found");
  });

  it('sub-router mounting with prefix', () => {
    const mainRouter = new Router();
    const subRouter = new Router();

    subRouter.add('GET', '/health', [() => {}]);
    mainRouter.mount('/api/v1', subRouter);

    expect(mainRouter.match('GET', '/api/v1/health')).not.toBeNull();
    expect(mainRouter.match('GET', '/health')).toBeNull();
  });
});
