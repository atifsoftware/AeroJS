/**
 * @file router.ts
 * @description Radix Tree routing engine supporting route params, wildcards, regex caching,
 * route naming, 405 Method Not Allowed discovery, route groups, and controller resolution.
 */

import type { DefaultState } from './context.js';
import type { Middleware, RouteParams } from './types.js';
import { normalizePath } from './utils.js';
import { NamedMiddlewareRegistry } from '../routing/named-middleware.js';
import { RouteBuilder } from '../routing/route-builder.js';
import { RouteGroup } from '../routing/route-group.js';
import {
  isControllerTuple,
  createControllerHandler,
} from '../routing/controller.js';

export interface RouteSchema {
  body?: unknown;
  query?: unknown;
  querystring?: unknown;
  params?: unknown;
  headers?: unknown;
  response?: Record<string | number, unknown>;
}

export interface Route<State = DefaultState> {
  readonly method: string;
  readonly path: string;
  handlers: (Middleware<State> | string)[];
  schema?: RouteSchema;
  name?: string;
  readonly paramNames?: readonly string[];
}

export interface RouteMatch<State = DefaultState> {
  readonly route: Route<State>;
  readonly params: RouteParams;
  readonly handlers: readonly (Middleware<State> | string)[];
}

class RadixNode<State = DefaultState> {
  public children: Map<string, RadixNode<State>> = new Map();
  public paramChild?: RadixNode<State>;
  public wildcardChild?: RadixNode<State>;
  public routes: Map<string, Route<State>> = new Map();
}

function splitPath(path: string): string[] {
  const norm = normalizePath(path);
  if (norm === '/') {
    return [];
  }
  return norm.slice(1).split('/');
}

export function normalizeRouteHandlers<State = DefaultState>(
  rawHandlers: any[]
): (Middleware<State> | string)[] {
  const result: (Middleware<State> | string)[] = [];

  for (let i = 0; i < rawHandlers.length; i++) {
    const h = rawHandlers[i];

    if (Array.isArray(h)) {
      if (isControllerTuple(h)) {
        result.push(createControllerHandler<State>(h[0], h[1]));
      } else {
        result.push(...normalizeRouteHandlers<State>(h));
      }
      continue;
    }

    if (
      typeof h === 'function' &&
      h.prototype &&
      i + 1 < rawHandlers.length &&
      typeof rawHandlers[i + 1] === 'string' &&
      typeof h.prototype[rawHandlers[i + 1]] === 'function'
    ) {
      result.push(createControllerHandler<State>(h, rawHandlers[i + 1]));
      i++; // Skip the method name
      continue;
    }

    if (typeof h === 'function' || typeof h === 'string') {
      result.push(h);
      continue;
    }

    throw new TypeError(`Invalid route handler: ${typeof h}`);
  }

  return result;
}

export class Router<State = DefaultState> {
  private readonly root = new RadixNode<State>();
  private readonly allRoutes: Route<State>[] = [];
  private readonly namedRoutes: Map<string, Route<State>> = new Map();
  private readonly regexCache: Map<string, RegExp> = new Map();

  public get routes(): readonly Route<State>[] {
    return this.allRoutes;
  }

  constructor(
    public readonly namedMiddleware?: NamedMiddlewareRegistry<State>
  ) {}

  public registerNamedRoute(name: string, route: Route<State>): void {
    this.namedRoutes.set(name, route);
  }

  public add(
    method: string,
    path: string,
    handlers: any[],
    schema?: RouteSchema,
    name?: string
  ): RouteBuilder<State> {
    const upperMethod = method.toUpperCase();
    const normalized = normalizePath(path);
    const segments = splitPath(normalized);

    const paramNames: string[] = [];
    let current = this.root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;

      if (segment.startsWith('*')) {
        const paramName = segment.length > 1 ? segment.slice(1) : '*';
        paramNames.push(paramName);
        if (!current.wildcardChild) {
          current.wildcardChild = new RadixNode<State>();
        }
        current = current.wildcardChild;
      } else if (segment.startsWith(':')) {
        const paramName = segment.slice(1);
        paramNames.push(paramName);
        if (!current.paramChild) {
          current.paramChild = new RadixNode<State>();
        }
        current = current.paramChild;
      } else {
        let child = current.children.get(segment);
        if (!child) {
          child = new RadixNode<State>();
          current.children.set(segment, child);
        }
        current = child;
      }
    }

    const normalizedHandlers = normalizeRouteHandlers<State>(handlers);

    const route: Route<State> = {
      method: upperMethod,
      path: normalized,
      handlers: normalizedHandlers,
      schema,
      name,
      paramNames: Object.freeze([...paramNames]),
    };

    const existing = current.routes.get(upperMethod);
    if (existing) {
      const idx = this.allRoutes.indexOf(existing);
      if (idx !== -1) {
        this.allRoutes.splice(idx, 1);
      }
    }
    current.routes.set(upperMethod, route);
    this.allRoutes.push(route);

    if (name) {
      this.namedRoutes.set(name, route);
    }

    // Cache precompiled regex for fast pattern testing
    if (!this.regexCache.has(normalized)) {
      const pattern = normalized
        .replace(/:([a-zA-Z0-9_]+)/g, '(?<$1>[^/]+)')
        .replace(/\*([a-zA-Z0-9_]+)/g, '(?<$1>.*)')
        .replace(/\*/g, '(.*)');
      this.regexCache.set(normalized, new RegExp(`^${pattern}$`));
    }

    return new RouteBuilder<State>(route, this, this.namedMiddleware);
  }

  public match(method: string, path: string): RouteMatch<State> | null {
    const upperMethod = method.toUpperCase();
    const normalized = normalizePath(path);
    const segments = splitPath(normalized);

    const result = this.searchNode(this.root, segments, 0, []);
    if (!result) {
      return null;
    }

    const { node, captured } = result;
    let route = node.routes.get(upperMethod);
    if (!route) {
      route = node.routes.get('ALL');
    }
    if (!route && upperMethod === 'HEAD') {
      route = node.routes.get('GET');
    }

    if (!route) {
      return null;
    }

    const params: Record<string, string> = {};
    if (route.paramNames) {
      for (let i = 0; i < route.paramNames.length; i++) {
        params[route.paramNames[i]!] = captured[i] ?? '';
      }
    }

    return {
      route,
      params,
      handlers: route.handlers,
    };
  }

  public hasPath(path: string): boolean {
    const normalized = normalizePath(path);
    const segments = splitPath(normalized);

    const result = this.searchNode(this.root, segments, 0, []);
    return Boolean(result && result.node.routes.size > 0);
  }

  public allowedMethods(path: string): string[] {
    const normalized = normalizePath(path);
    const segments = splitPath(normalized);

    const result = this.searchNode(this.root, segments, 0, []);
    if (!result) {
      return [];
    }

    const methods = new Set<string>();
    for (const m of result.node.routes.keys()) {
      if (m === 'ALL') {
        methods.add('GET');
        methods.add('POST');
        methods.add('PUT');
        methods.add('PATCH');
        methods.add('DELETE');
        methods.add('HEAD');
        methods.add('OPTIONS');
      } else {
        methods.add(m);
      }
    }

    if (methods.has('GET')) {
      methods.add('HEAD');
    }
    methods.add('OPTIONS');

    return Array.from(methods);
  }

  private searchNode(
    current: RadixNode<State>,
    segments: string[],
    index: number,
    captured: string[]
  ): { node: RadixNode<State>; captured: string[] } | null {
    if (index === segments.length) {
      if (current.routes.size > 0) {
        return { node: current, captured };
      }
      if (current.wildcardChild && current.wildcardChild.routes.size > 0) {
        return { node: current.wildcardChild, captured: [...captured, ''] };
      }
      return null;
    }

    const segment = segments[index]!;

    // 1. Static match
    const child = current.children.get(segment);
    if (child) {
      const match = this.searchNode(child, segments, index + 1, captured);
      if (match) return match;
    }

    // 2. Param match
    if (current.paramChild) {
      const match = this.searchNode(current.paramChild, segments, index + 1, [...captured, segment]);
      if (match) return match;
    }

    // 3. Wildcard match
    if (current.wildcardChild) {
      const remainingCount = segments.length - index;

      // If wildcard has child branches (e.g. /files/*path/nested), try candidate lengths
      if (current.wildcardChild.children.size > 0 || current.wildcardChild.paramChild) {
        for (let k = 0; k < remainingCount; k++) {
          const wildcardVal = segments.slice(index, index + k).join('/');
          const match = this.searchNode(current.wildcardChild, segments, index + k, [...captured, wildcardVal]);
          if (match) return match;
        }
      }

      // Terminal wildcard match: consumes all remaining segments
      if (current.wildcardChild.routes.size > 0) {
        const remainingVal = segments.slice(index).join('/');
        return { node: current.wildcardChild, captured: [...captured, remainingVal] };
      }
    }

    return null;
  }

  public mount(prefix: string, subRouter: Router<State>): this {
    const cleanPrefix = normalizePath(prefix);
    for (const route of subRouter.allRoutes) {
      const combinedPath =
        route.path === '/'
          ? cleanPrefix
          : normalizePath(`${cleanPrefix}${route.path}`);
      this.add(route.method, combinedPath, [...route.handlers], route.schema, route.name);
    }
    return this;
  }

  public group(prefix: string, callback: (group: RouteGroup<State>) => void): this {
    const group = new RouteGroup<State>(prefix, this, this.namedMiddleware);
    callback(group);
    return this;
  }

  public urlFor(name: string, params: Record<string, string | number> = {}): string {
    const route = this.namedRoutes.get(name);
    if (!route) {
      throw new Error(`Route with name '${name}' not found`);
    }

    let url = route.path;
    const remainingParams = { ...params };

    // Replace :param placeholders
    const paramMatches = Array.from(url.matchAll(/:([a-zA-Z0-9_]+)/g));
    for (const match of paramMatches) {
      const paramName = match[1]!;
      if (!(paramName in remainingParams)) {
        throw new Error(`Missing required route parameter '${paramName}' for route '${name}'.`);
      }
      url = url.replace(`:${paramName}`, encodeURIComponent(String(remainingParams[paramName])));
      delete remainingParams[paramName];
    }

    // Replace *wildcard or * placeholders
    const wildcardMatches = Array.from(url.matchAll(/\*([a-zA-Z0-9_]*)/g));
    for (const match of wildcardMatches) {
      const wildcardName = match[1] || '*';
      if (wildcardName in remainingParams) {
        url = url.replace(`*${match[1]}`, String(remainingParams[wildcardName]));
        delete remainingParams[wildcardName];
      }
    }

    // Append any unused parameters as a query string
    const queryEntries = Object.entries(remainingParams);
    if (queryEntries.length > 0) {
      const qs = queryEntries
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      url = `${url}?${qs}`;
    }

    return url;
  }

  public get(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.add('GET', path, handlers);
  }

  public post(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.add('POST', path, handlers);
  }

  public put(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.add('PUT', path, handlers);
  }

  public patch(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.add('PATCH', path, handlers);
  }

  public delete(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.add('DELETE', path, handlers);
  }

  public head(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.add('HEAD', path, handlers);
  }

  public options(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.add('OPTIONS', path, handlers);
  }

  public all(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.add('ALL', path, handlers);
  }
}
