/**
 * @file inertia.ts
 * @description Official Inertia.js protocol adapter for Aero supporting React and Vue 3.
 */

import type { AeroContext, DefaultState } from '../core/context.js';
import type { Middleware } from '../core/types.js';
import { SSREngine, type SSREngineOptions } from '../ssr/engine.js';

export interface InertiaPage<Props = Record<string, unknown>> {
  component: string;
  props: Props;
  url: string;
  version: string;
}

export type InertiaProp = unknown | (() => unknown | Promise<unknown>);

export interface InertiaConfig {
  rootView?: string | ((page: InertiaPage) => string | Promise<string>);
  version?: string | (() => string | Promise<string>);
  ssr?: boolean | SSREngineOptions | ((page: InertiaPage) => Promise<{ head?: string[]; body: string } | string>);
}

/**
 * Creates a lazy-evaluated prop that is only computed during partial reloads.
 */
export function lazy<T>(fn: () => T | Promise<T>): () => Promise<T> {
  return async () => fn();
}

/**
 * Inertia.js Context wrapper attached to each request via ctx.inertia.
 */
export class Inertia<State = DefaultState> {
  private readonly sharedProps = new Map<string, InertiaProp>();
  private readonly version: string;
  private readonly rootView: (page: InertiaPage) => string | Promise<string>;
  private readonly ssrEngine?: SSREngine;

  constructor(
    private readonly ctx: AeroContext<State, any>,
    config: InertiaConfig = {}
  ) {
    this.version = typeof config.version === 'function' ? String(config.version()) : config.version ?? '1.0';

    if (config.ssr) {
      if (typeof config.ssr === 'function') {
        this.ssrEngine = new SSREngine({ render: config.ssr });
      } else if (typeof config.ssr === 'object') {
        this.ssrEngine = new SSREngine(config.ssr);
      } else {
        this.ssrEngine = new SSREngine();
      }
    }

    if (typeof config.rootView === 'function') {
      this.rootView = config.rootView;
    } else {
      const template = config.rootView ?? this.defaultHtmlTemplate();
      this.rootView = async (page: InertiaPage) => {
        if (this.ssrEngine) {
          const rendered = await this.ssrEngine.render(page);
          return rendered.html;
        }

        const escaped = JSON.stringify(page)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');

        return template.replace(
          /@inertia|<!-- @inertia -->|<div id="app"><\/div>/,
          `<div id="app" data-page="${escaped}"></div>`
        );
      };
    }
  }

  public share(keyOrProps: string | Record<string, InertiaProp>, value?: InertiaProp): this {
    if (typeof keyOrProps === 'string') {
      this.sharedProps.set(keyOrProps, value);
    } else if (typeof keyOrProps === 'object' && keyOrProps !== null) {
      for (const [k, v] of Object.entries(keyOrProps)) {
        this.sharedProps.set(k, v);
      }
    }
    return this;
  }

  /**
   * Renders an Inertia component with props, automatically handling initial HTML
   * loads or subsequent X-Inertia JSON requests.
   */
  public async render<T extends Record<string, InertiaProp>>(
    component: string,
    props: T = {} as T
  ): Promise<void> {
    const isInertia = this.ctx.req.get('x-inertia') === 'true';
    const clientVersion = this.ctx.req.get('x-inertia-version');

    // 1. Asset version mismatch check on GET requests
    if (isInertia && this.ctx.method === 'GET' && clientVersion && clientVersion !== this.version) {
      this.ctx.status(409).set('X-Inertia-Location', this.ctx.req.url).send(null);
      return;
    }

    // 2. Resolve partial reload keys if specified
    const partialComponent = this.ctx.req.get('x-inertia-partial-component');
    const partialData = this.ctx.req.get('x-inertia-partial-data');
    const isPartial = isInertia && partialComponent === component && Boolean(partialData);

    const partialKeys = isPartial ? partialData!.split(',').map((k) => k.trim()) : null;

    // 3. Resolve shared and route-specific props
    const allRawProps: Record<string, InertiaProp> = {
      ...Object.fromEntries(this.sharedProps),
      ...props,
    };

    const resolvedProps: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(allRawProps)) {
      if (partialKeys && !partialKeys.includes(key)) {
        continue;
      }

      if (typeof val === 'function') {
        resolvedProps[key] = await val();
      } else {
        resolvedProps[key] = val;
      }
    }

    const page: InertiaPage = {
      component,
      props: resolvedProps,
      url: this.ctx.req.url,
      version: this.version,
    };

    // 4. Return JSON for Inertia AJAX requests, or full HTML shell for first visits
    if (isInertia) {
      this.ctx.set('X-Inertia', 'true');
      this.ctx.set('Vary', 'Accept');
      this.ctx.status(200).json(page);
    } else {
      const html = await this.rootView(page);
      this.ctx.html(html);
    }
  }

  /**
   * Issues an Inertia-compatible redirect (using 303 See Other on PUT/PATCH/DELETE).
   */
  public redirect(url: string): void {
    const method = this.ctx.method;
    const status = ['PUT', 'PATCH', 'DELETE'].includes(method) ? 303 : 302;
    this.ctx.redirect(url, status);
  }

  /**
   * Client-side hard redirect for external URLs or version conflicts.
   */
  public location(url: string): void {
    if (this.ctx.req.get('x-inertia') === 'true') {
      this.ctx.status(409).set('X-Inertia-Location', url).send(null);
    } else {
      this.ctx.redirect(url);
    }
  }

  private defaultHtmlTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Aero App</title>
</head>
<body>
  @inertia
</body>
</html>`;
  }
}

// Extend AeroContext with inertia helper
declare module '../core/context.js' {
  interface AeroContext {
    inertia: Inertia;
  }
}

/**
 * Creates an Inertia.js middleware attaching `ctx.inertia` to every request.
 */
export function inertiaPlugin<State = DefaultState>(
  config: InertiaConfig = {}
): Middleware<State> {
  return async (ctx, next) => {
    (ctx as any).inertia = new Inertia<State>(ctx, config);
    await next();
  };
}
