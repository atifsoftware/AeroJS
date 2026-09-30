/**
 * @file view.ts
 * @description View engine adapter supporting Edge.js, EJS, and custom template renderers.
 */

import type { AeroContext, DefaultState } from '../core/context.js';
import type { Middleware } from '../core/types.js';

export interface ViewDriver {
  render(template: string, data?: Record<string, unknown>): Promise<string> | string;
}

/**
 * Built-in zero-dependency template driver supporting variable interpolation ({{ key }}).
 */
export class SimpleViewDriver implements ViewDriver {
  private readonly templates = new Map<string, string>();

  constructor(initialTemplates: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initialTemplates)) {
      this.templates.set(k, v);
    }
  }

  public register(name: string, content: string): this {
    this.templates.set(name, content);
    return this;
  }

  public async render(template: string, data: Record<string, unknown> = {}): Promise<string> {
    const raw = this.templates.get(template) ?? template;
    return raw.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key) => {
      const keys = key.split('.');
      let val: any = data;
      for (const k of keys) {
        if (val && typeof val === 'object' && k in val) {
          val = val[k];
        } else {
          return '';
        }
      }
      return String(val ?? '');
    });
  }
}

/**
 * Creates an adapter for AdonisJS's official @edge-js/edge template engine.
 */
export function createEdgeDriver(edgeInstance: {
  render(template: string, state?: Record<string, unknown>): Promise<string>;
}): ViewDriver {
  return {
    async render(template: string, data: Record<string, unknown> = {}): Promise<string> {
      return edgeInstance.render(template, data);
    },
  };
}

/**
 * Creates an adapter for the EJS template engine.
 */
export function createEjsDriver(
  ejsInstance: {
    render(template: string, data?: Record<string, unknown>, options?: Record<string, unknown>): string | Promise<string>;
  },
  options: Record<string, unknown> = {}
): ViewDriver {
  return {
    async render(template: string, data: Record<string, unknown> = {}): Promise<string> {
      return ejsInstance.render(template, data, options);
    },
  };
}

/**
 * View engine orchestrating template rendering and shared view globals.
 */
export class ViewEngine {
  private readonly sharedGlobals = new Map<string, unknown>();

  constructor(public driver: ViewDriver) {}

  public share(key: string, value: unknown): this {
    this.sharedGlobals.set(key, value);
    return this;
  }

  public async render(template: string, data: Record<string, unknown> = {}): Promise<string> {
    const combinedData = {
      ...Object.fromEntries(this.sharedGlobals),
      ...data,
    };
    return this.driver.render(template, combinedData);
  }
}

// Extend AeroContext with view helper
declare module '../core/context.js' {
  interface AeroContext {
    view(template: string, data?: Record<string, unknown>): Promise<void>;
    render(template: string, data?: Record<string, unknown>): Promise<void>;
  }
}

/**
 * Creates a middleware that attaches `ctx.view(template, data)` to AeroContext.
 */
export function viewPlugin<State = DefaultState>(
  driverOrEngine: ViewDriver | ViewEngine
): Middleware<State> {
  const engine = driverOrEngine instanceof ViewEngine ? driverOrEngine : new ViewEngine(driverOrEngine);

  return async (ctx, next) => {
    (ctx as any).view = async (template: string, data?: Record<string, unknown>) => {
      const html = await engine.render(template, data);
      ctx.html(html);
    };
    (ctx as any).render = (ctx as any).view;

    await next();
  };
}
