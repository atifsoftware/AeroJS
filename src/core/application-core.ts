/**
 * @file application-core.ts
 * @description Core HTTP application engine orchestrating routing, onion middleware pipeline,
 * IoC container, lifecycle hooks, and server lifecycle.
 */

import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
  type RequestListener,
} from 'node:http';
import type { Duplex } from 'node:stream';
import { AeroRequest } from './request.js';
import { AeroResponse } from './response.js';
import { AeroContext, type DefaultState } from './context.js';
import { compose } from './middleware.js';
import { Router, type RouteSchema } from './router.js';
import type {
  AeroOptions,
  Middleware,
  ErrorHandler,
} from './types.js';
import { parseBody } from './body-parser.js';
import { assertValid, compileFastSerializer } from '../validation/schema.js';
import { Container } from '../di/container.js';
import { ServiceProvider, type ServiceProviderConstructor } from '../di/provider.js';
import { Config } from '../config/config.js';
import { NamedMiddlewareRegistry } from '../routing/named-middleware.js';
import { RouteBuilder } from '../routing/route-builder.js';
import { RouteGroup } from '../routing/route-group.js';
import { SKIP_OVERRIDE, type AeroPlugin, type PluginOptions } from '../plugins/plugin.js';
import { normalizePath } from './utils.js';
import {
  AeroError,
  NotFoundError,
  MethodNotAllowedError,
} from './errors.js';
import { renderErrorDashboard } from './error-dashboard.js';
import { loadEnv } from '../config/env.js';
import {
  handleWebSocketUpgrade,
  type WebSocketUpgradeHandler,
} from '../ws/websocket.js';
import { WebSocketHub } from '../ws/websocket-hub.js';
import { HookRunner, type HookMap, type HookName } from './hooks.js';
export { type HookMap, type HookName } from './hooks.js';

export class ApplicationCore<State = DefaultState> {
  protected readonly wsRoutes = new Map<string, WebSocketUpgradeHandler>();
  public readonly websocketHub = new WebSocketHub();

  // The application exposing ws.hub as requested
  public readonly ws = Object.assign(
    (path: string, handler: WebSocketUpgradeHandler) => this.registerWs(path, handler),
    { hub: this.websocketHub }
  );

  protected readonly upgradeHandlers: ((req: IncomingMessage, socket: Duplex, head: Buffer) => void)[] = [];
  public readonly configOptions: AeroOptions;
  public readonly namedMiddleware = new NamedMiddlewareRegistry<State>();
  public readonly router: Router<State>;
  public readonly hookRunner = new HookRunner<State>();
  protected readonly middlewares: Middleware<State>[] = [];


  public async broadcast(channels: string | string[], event: string, data?: any): Promise<void> {
    await this.websocketHub.broadcast(channels, event, data);
  }

  public get hooks(): HookRunner<State>['hooks'] {
    return this.hookRunner.hooks;
  }

  public readonly container = new Container();
  public readonly config = new Config();
  protected readonly serviceProviders: ServiceProvider[] = [];
  protected isBooted = false;

  protected customErrorHandler?: ErrorHandler<State>;
  protected server?: Server;
  protected readonly customDecorators: Map<string, unknown> = new Map();
  protected readonly requestDecorators: Map<string, unknown> = new Map();
  protected readonly replyDecorators: Map<string, unknown> = new Map();

  constructor(options: AeroOptions = {}) {
    loadEnv();
    const isDev = process.env.APP_DEBUG === 'true' || (process.env.APP_DEBUG !== 'false' && process.env.NODE_ENV !== 'production');
    this.router = new Router<State>(this.namedMiddleware);
    this.configOptions = {
      debug: isDev,
      disableDefault404: false,
      bodyLimit: 1024 * 1024, // 1MB
      trustProxy: false,
      ...options,
    };
  }

  public middleware(name: string, fn: Middleware<State>): this {
    this.namedMiddleware.register(name, fn);
    return this;
  }

  public registerMiddleware(name: string, fn: Middleware<State>): this {
    this.namedMiddleware.register(name, fn);
    return this;
  }

  public group(prefix: string, callback: (group: RouteGroup<State>) => void): this {
    this.router.group(prefix, callback);
    return this;
  }

  public use(fnOrPrefix: Middleware<State> | string, fnOrRouter?: Middleware<State> | Router<State>): this {
    if (typeof fnOrPrefix === 'string') {
      const prefix = fnOrPrefix;
      if (fnOrRouter instanceof Router) {
        this.router.mount(prefix, fnOrRouter);
      } else if (typeof fnOrRouter === 'function') {
        const scopedMiddleware: Middleware<State> = async (ctx, next) => {
          if (ctx.path === prefix || ctx.path.startsWith(`${prefix}/`)) {
            await fnOrRouter(ctx, next);
          } else {
            await next();
          }
        };
        this.middlewares.push(scopedMiddleware);
      }
    } else if (typeof fnOrPrefix === 'function') {
      this.middlewares.push(fnOrPrefix);
    }
    return this;
  }

  public get(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.get(path, ...handlers);
  }

  public enableHealthCheck(path = '/health'): this {
    this.get(path, (ctx: AeroContext<State>) => {
      ctx.json({ status: 'ok' });
    });
    return this;
  }

  public post(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.post(path, ...handlers);
  }

  public put(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.put(path, ...handlers);
  }

  public patch(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.patch(path, ...handlers);
  }

  public delete(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.delete(path, ...handlers);
  }

  public head(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.head(path, ...handlers);
  }

  public options(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.options(path, ...handlers);
  }

  public all(path: string, ...handlers: any[]): RouteBuilder<State> {
    return this.router.all(path, ...handlers);
  }

  public routeWithSchema(
    method: string,
    path: string,
    schema: RouteSchema,
    ...handlers: any[]
  ): RouteBuilder<State> {
    return this.router.add(method, path, handlers, schema);
  }

  public registerWs(path: string, handler: WebSocketUpgradeHandler): this {
    this.wsRoutes.set(normalizePath(path), handler);
    return this;
  }

  public onUpgrade(handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): this {
    this.upgradeHandlers.push(handler);
    return this;
  }

  public handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const rawUrl = req.url ? req.url.split('?')[0] : '/';
    const cleanUrl = normalizePath(rawUrl || '/');

    const wsHandler = this.wsRoutes.get(cleanUrl);
    if (wsHandler) {
      const ws = handleWebSocketUpgrade(req, socket, head);
      if (ws) {
        // Automatically attach to the Hub for Pusher/Echo capabilities
        // We pass the user from req if it exists (e.g., from auth middleware reading upgrade headers)
        this.websocketHub.handleConnection(ws, (req as any).user);
        void wsHandler(ws, req);
      }
      return;
    }

    for (const handler of this.upgradeHandlers) {
      handler(req, socket, head);
      return;
    }

    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }

  public addHook<K extends HookName>(name: K, handler: HookMap<State>[K]): this {
    this.hookRunner.add(name, handler);
    return this;
  }

  public onError(handler: ErrorHandler<State>): this {
    this.customErrorHandler = handler;
    return this;
  }

  public decorate(name: string, value: unknown): this {
    if (name in this) {
      throw new Error(`The decorator '${name}' is already defined on Aero`);
    }
    this.customDecorators.set(name, value);
    Object.defineProperty(this, name, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return this;
  }

  public decorateRequest(name: string, value: unknown): this {
    this.requestDecorators.set(name, value);
    return this;
  }

  public decorateReply(name: string, value: unknown): this {
    this.replyDecorators.set(name, value);
    return this;
  }

  public createChildScope(prefix?: string): this {
    const child = Object.create(this) as this;
    (child as any).container = this.container.createChildContainer();
    const childMiddlewares: Middleware<State>[] = [];
    const childHooks: { [K in HookName]: HookMap<State>[K][] } = {
      onRequest: [],
      preParsing: [],
      preValidation: [],
      preHandler: [],
      preSerialization: [],
      onSend: [],
      onResponse: [],
      onError: [],
    };

    child.use = (fnOrPrefix: any, fnOrRouter?: any): any => {
      if (typeof fnOrPrefix === 'string') {
        const fullPrefix = prefix ? `${prefix}/${fnOrPrefix}` : fnOrPrefix;
        return this.use(fullPrefix, fnOrRouter);
      }
      if (typeof fnOrPrefix === 'function') {
        childMiddlewares.push(fnOrPrefix);
      }
      return child;
    };

    child.addHook = <K extends HookName>(name: K, handler: HookMap<State>[K]): any => {
      childHooks[name].push(handler);
      return child;
    };

    child.decorate = (name: string, value: unknown): any => {
      Object.defineProperty(child, name, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return child;
    };

    const formatPath = (p: string): string => {
      if (!prefix) return normalizePath(p);
      const cleanPrefix = normalizePath(prefix);
      const cleanP = normalizePath(p);
      if (cleanP === '/') return cleanPrefix;
      if (cleanPrefix === '/') return cleanP;
      return normalizePath(`${cleanPrefix}/${cleanP}`);
    };

    const createChildRoute = (method: string, path: string, handlers: any[]): RouteBuilder<State> => {
      const fullPath = formatPath(path);
      const scopedHandlers: any[] = [];
      if (childHooks.preHandler.length > 0) {
        scopedHandlers.push(async (ctx: any, next: any) => {
          for (const hook of childHooks.preHandler) {
            await hook(ctx);
          }
          await next();
        });
      }
      return this.router.add(method, fullPath, [
        ...childMiddlewares,
        ...scopedHandlers,
        ...handlers,
      ]);
    };

    child.get = (p: string, ...h: any[]) => createChildRoute('GET', p, h);
    child.post = (p: string, ...h: any[]) => createChildRoute('POST', p, h);
    child.put = (p: string, ...h: any[]) => createChildRoute('PUT', p, h);
    child.patch = (p: string, ...h: any[]) => createChildRoute('PATCH', p, h);
    child.delete = (p: string, ...h: any[]) => createChildRoute('DELETE', p, h);
    child.head = (p: string, ...h: any[]) => createChildRoute('HEAD', p, h);
    child.options = (p: string, ...h: any[]) => createChildRoute('OPTIONS', p, h);
    child.all = (p: string, ...h: any[]) => createChildRoute('ALL', p, h);

    child.register = (plugin: any, opts?: any) => {
      const combinedPrefix = opts?.prefix
        ? (prefix ? `${prefix}/${opts.prefix}` : opts.prefix)
        : prefix;
      if (typeof plugin === 'function' && !plugin[SKIP_OVERRIDE]) {
        const nestedChild = child.createChildScope(combinedPrefix);
        const result = plugin(nestedChild, { ...opts, prefix: combinedPrefix });
        if (result instanceof Promise) {
          return result.then(() => child);
        }
        return child;
      }
      return this.register(plugin, { ...opts, prefix: combinedPrefix });
    };

    return child;
  }

  public register(
    providerOrPlugin:
      | ServiceProviderConstructor
      | ServiceProvider
      | AeroPlugin<any, State>
      | ((app: any, opts?: Record<string, unknown>) => void | Promise<void>),
    options?: PluginOptions
  ): this | Promise<this> {
    if (typeof providerOrPlugin === 'function') {
      if (providerOrPlugin.prototype instanceof ServiceProvider) {
        const Ctor = providerOrPlugin as ServiceProviderConstructor;
        const provider = new Ctor(this as any);
        this.serviceProviders.push(provider);
        return this;
      }

      const fn = providerOrPlugin as AeroPlugin<any, State>;
      if (fn[SKIP_OVERRIDE]) {
        const result = fn(this as any, options);
        if (result instanceof Promise) {
          return result.then(() => this);
        }
        return this;
      }

      const childScope = this.createChildScope(options?.prefix);
      const result = fn(childScope as any, options);
      if (result instanceof Promise) {
        return result.then(() => this);
      }
      return this;
    }

    if (providerOrPlugin instanceof ServiceProvider) {
      this.serviceProviders.push(providerOrPlugin);
      return this;
    }
    return this;
  }

  public registerProvider(provider: ServiceProviderConstructor | ServiceProvider): this {
    return this.register(provider) as this;
  }

  public async boot(): Promise<void> {
    if (this.isBooted) return;
    this.isBooted = true;

    for (const provider of this.serviceProviders) {
      await provider.register();
    }
    for (const provider of this.serviceProviders) {
      await provider.boot();
    }
    for (const provider of this.serviceProviders) {
      await provider.ready();
    }
  }

  public urlFor(name: string, params: Record<string, string | number> = {}): string {
    return this.router.urlFor(name, params);
  }

  public async handleRequest(
    rawReq: IncomingMessage,
    rawRes: ServerResponse
  ): Promise<void> {
    const req = new AeroRequest(rawReq, { trustProxy: this.configOptions.trustProxy });
    const res = new AeroResponse(rawRes);
    const ctx = new AeroContext<State>(req, res, {} as State, this.container);

    res.setHeader('x-request-id', req.id);

    if (req.method === 'HEAD') {
      res.isHead = true;
    }

    for (const [key, val] of this.requestDecorators.entries()) {
      req.setCustom(key, val);
      Object.defineProperty(req, key, { value: val, configurable: true, writable: true });
    }

    for (const [key, val] of this.replyDecorators.entries()) {
      res.setCustom(key, val);
      Object.defineProperty(res, key, { value: val, configurable: true, writable: true });
    }

    for (const [key, val] of this.customDecorators.entries()) {
      Object.defineProperty(ctx, key, { value: val, configurable: true, writable: true });
    }

    try {
      if (!this.isBooted && this.serviceProviders.length > 0) {
        await this.boot();
      }

      // 1. onRequest hooks
      await this.hookRunner.runOnRequest(ctx);
      if (res.isSent) return;

      // 2. Match route first to avoid DoS body parsing on non-existent routes
      const match = this.router.match(req.method, req.path);

      if (!match) {
        if (this.middlewares.length > 0) {
          const methodsWithBody = ['POST', 'PUT', 'PATCH', 'DELETE'];
          if (methodsWithBody.includes(req.method) && req.headers['content-type'] && ctx.body === undefined) {
            await this.hookRunner.runPreParsing(ctx);
            ctx.body = await parseBody(rawReq, { limit: this.configOptions.bodyLimit });
            if ((rawReq as any).files) {
              ctx.req.files = (rawReq as any).files;
            }
          }
          const globalPipeline = compose(this.middlewares);
          await globalPipeline(ctx);
          if (res.isSent || res.headersSent || res.payload !== undefined) {
            if (!res.isSent && !res.headersSent && res.payload !== undefined) {
              let payload = await this.hookRunner.runPreSerialization(ctx, res.payload);
              payload = await this.hookRunner.runOnSend(ctx, payload);
              res.send(payload);
            }
            await this.hookRunner.runOnResponse(ctx);
            return;
          }
        }

        if (this.router.hasPath(req.path)) {
          const allowed = this.router.allowedMethods(req.path);
          if (req.method === 'OPTIONS') {
            res.set('Allow', allowed.join(', '));
            res.status(204).send(null);
            return;
          }
          res.set('Allow', allowed.join(', '));
          throw new MethodNotAllowedError(`Method ${req.method} not allowed for ${req.path}`, allowed);
        }

        if (req.method === 'OPTIONS') {
          res.set('Allow', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
          res.status(204).send(null);
          return;
        }

        if (!this.configOptions.disableDefault404) {
          throw new NotFoundError(`Cannot ${req.method} ${req.path}`);
        }
        return;
      }

      ctx.params = match.params;

      // 3. Parse request body if content-type present and method allows body
      const methodsWithBody = ['POST', 'PUT', 'PATCH', 'DELETE'];
      if (methodsWithBody.includes(req.method) && req.headers['content-type']) {
        await this.hookRunner.runPreParsing(ctx);
        ctx.body = await parseBody(rawReq, { limit: this.configOptions.bodyLimit });
        if ((rawReq as any).files) {
          ctx.req.files = (rawReq as any).files;
        }
      }

      // 4. preValidation hooks
      await this.hookRunner.runPreValidation(ctx);
      if (res.isSent) return;

      // 5. Schema validation
      if (match.route.schema) {
        const schema = match.route.schema;
        if (schema.params) {
          assertValid(schema.params, ctx.params, 'params');
        }
        const querySchema = schema.query ?? schema.querystring;
        if (querySchema) {
          assertValid(querySchema, ctx.query, 'query');
        }
        if (schema.headers) {
          assertValid(schema.headers, ctx.headers, 'headers');
        }
        if (schema.body && ctx.body !== undefined) {
          assertValid(schema.body, ctx.body, 'body');
        }
        if (schema.response) {
          const expectedStatus = res.statusCode || 200;
          const respSchema = schema.response[expectedStatus] ?? schema.response['2xx'];
          if (respSchema) {
            res.serializer = compileFastSerializer(respSchema);
          }
        }
      }

      // 6. preHandler hooks
      await this.hookRunner.runPreHandler(ctx);
      if (res.isSent) return;

      // 7. Compose and run global middleware + route handlers
      const resolvedHandlers: Middleware<State>[] = match.handlers.map((h: any) => {
        if (typeof h === 'string') {
          return this.namedMiddleware.get(h);
        }
        return h;
      });
      const pipeline = compose([...this.middlewares, ...resolvedHandlers]);
      await pipeline(ctx);

      // 5. Response dispatching
      if (!res.isSent && !res.headersSent) {
        if (res.payload !== undefined) {
          let payload = await this.hookRunner.runPreSerialization(ctx, res.payload);
          payload = await this.hookRunner.runOnSend(ctx, payload);
          res.send(payload);
        } else {
          res.status(204).send(null);
        }
      }

      // 6. onResponse hooks
      await this.hookRunner.runOnResponse(ctx);
    } catch (err) {
      await this.handleError(err, ctx);
    }
  }

  private async handleError(rawError: unknown, ctx: AeroContext<State>): Promise<void> {
    const error = rawError instanceof Error ? rawError : new Error(String(rawError));

    try {
      await this.hookRunner.runOnError(error, ctx);

      if (this.customErrorHandler) {
        await this.customErrorHandler(error, ctx);
        return;
      }
    } catch (err) {
      console.error('Error within onError handler:', err);
    }

    if (ctx.res.headersSent) {
      return;
    }

    let status = 500;
    let code = 'INTERNAL_SERVER_ERROR';
    let details: unknown = undefined;

    if (error instanceof AeroError) {
      status = error.status;
      code = error.code ?? (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
      details = error.details;
    }

    // Next.js style Interactive Developer Error Dashboard for browser requests
    const isHtmlRequest = Boolean(
      ctx.req.headers.accept?.includes('text/html') &&
      !ctx.req.headers['x-inertia']
    );

    if (this.configOptions.debug && isHtmlRequest) {
      const html = renderErrorDashboard(error, ctx, { status, code });
      ctx.res.status(status).html(html);
      return;
    }

    ctx.res.status(status).send({
      error: {
        message: error.message || 'Internal Server Error',
        status,
        code,
        details,
        ...(this.configOptions.debug ? { stack: error.stack } : {}),
      },
    });
  }

  public callback(): RequestListener {
    return (req: IncomingMessage, res: ServerResponse) => {
      void this.handleRequest(req, res);
    };
  }

  public listen(
    port = 3000,
    hostOrCallback?: string | (() => void),
    callback?: () => void
  ): Server {
    if (!this.isBooted && this.serviceProviders.length > 0) {
      void this.boot();
    }
    const server = createServer(this.callback());
    this.server = server;
    server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head);
    });

    let host = '0.0.0.0';
    let cb = callback;

    if (typeof hostOrCallback === 'function') {
      cb = hostOrCallback;
    } else if (typeof hostOrCallback === 'string') {
      host = hostOrCallback;
    }

    server.listen(port, host, cb);
    return server;
  }

  public enableGracefulShutdown(): this {
    const handler = async () => {
      console.log('Gracefully shutting down...');
      await this.close();
      process.exit(0);
    };
    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
    return this;
  }

  public async listenAsync(port = 3000, host = '0.0.0.0'): Promise<Server> {
    await this.boot();
    return new Promise((resolve, reject) => {
      const server = this.listen(port, host, () => {
        resolve(server);
      });
      server.once('error', reject);
    });
  }

  public async close(): Promise<void> {
    const reverseProviders = [...this.serviceProviders].reverse();
    for (const provider of reverseProviders) {
      await provider.shutdown();
    }

    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server?.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
