/**
 * @file engine.ts
 * @description Next.js / Inertia.js Server-Side Rendering (SSR) Engine for AeroJS.
 * Supports React, Vue 3, and custom server-side component rendering with SEO meta tag extraction,
 * hydration data injection, and graceful fallback to client shell.
 */

import type { InertiaPage } from '../inertia/inertia.js';

export interface SSRRenderResult {
  head?: string[];
  body: string;
}

export type SSRRenderer = (page: InertiaPage) => Promise<SSRRenderResult | string> | SSRRenderResult | string;

export interface SSREngineOptions {
  /**
   * Component registry or resolver mapping component names to executable functions/components.
   */
  components?: Record<string, any>;
  resolveComponent?: (name: string) => any | Promise<any>;
  /**
   * Custom SSR render callback (e.g. using ReactDOMServer.renderToString or Vue renderToString).
   */
  render?: SSRRenderer;
  /**
   * Base HTML template containing @inertia and @head placeholders.
   */
  template?: string;
  /**
   * If true, errors in SSR will gracefully fall back to client shell instead of throwing.
   * Default: true.
   */
  gracefulFallback?: boolean;
}

export class SSREngine {
  private components = new Map<string, any>();
  private resolveComponent?: (name: string) => any | Promise<any>;
  private customRenderer?: SSRRenderer;
  private template: string;
  private gracefulFallback: boolean;

  constructor(options: SSREngineOptions = {}) {
    if (options.components) {
      for (const [name, comp] of Object.entries(options.components)) {
        this.components.set(name, comp);
      }
    }
    this.resolveComponent = options.resolveComponent;
    this.customRenderer = options.render;
    this.template = options.template || this.defaultTemplate();
    this.gracefulFallback = options.gracefulFallback ?? true;
  }

  /**
   * Registers a component for server-side rendering.
   */
  public register(name: string, component: any): this {
    this.components.set(name, component);
    return this;
  }

  /**
   * Resolves a component by name from registry or custom resolver.
   */
  public async getComponent(name: string): Promise<any | null> {
    if (this.components.has(name)) {
      return this.components.get(name);
    }
    if (this.resolveComponent) {
      const comp = await this.resolveComponent(name);
      if (comp) return comp;
    }
    return null;
  }

  /**
   * Performs server-side rendering of an Inertia page.
   */
  public async render(page: InertiaPage): Promise<{ html: string; body: string; head: string[] }> {
    let body = '';
    const head: string[] = [];

    try {
      if (this.customRenderer) {
        const res = await this.customRenderer(page);
        if (typeof res === 'string') {
          body = res;
        } else {
          body = res.body;
          if (res.head) head.push(...res.head);
        }
      } else {
        // Built-in component resolver renderer
        const component = await this.getComponent(page.component);
        if (typeof component === 'function') {
          const rendered = await component(page.props);
          if (typeof rendered === 'string') {
            body = rendered;
          } else if (rendered && typeof rendered.body === 'string') {
            body = rendered.body;
            if (rendered.head) head.push(...rendered.head);
          }
        }
      }
    } catch (err) {
      if (!this.gracefulFallback) {
        throw err;
      }
      // On SSR failure, body remains empty string and client shell will hydrate cleanly
      body = '';
    }

    // Escape data-page for HTML attribute safety
    const escaped = JSON.stringify(page)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const appHtml = `<div id="app" data-page="${escaped}">${body}</div>`;
    const headHtml = head.join('\n  ');

    let fullHtml = this.template;

    // Inject head tags
    if (fullHtml.includes('@head')) {
      fullHtml = fullHtml.replace('@head', headHtml);
    } else if (headHtml && fullHtml.includes('</head>')) {
      fullHtml = fullHtml.replace('</head>', `  ${headHtml}\n</head>`);
    }

    // Inject app container
    fullHtml = fullHtml.replace(
      /@inertia|<!-- @inertia -->|<div id="app"><\/div>/,
      appHtml
    );

    return { html: fullHtml, body, head };
  }

  private defaultTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  @head
</head>
<body>
  @inertia
</body>
</html>`;
  }
}
