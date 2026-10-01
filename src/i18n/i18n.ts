/**
 * @file i18n.ts
 * @description Enterprise I18n Localization Engine for AeroJS.
 * Supports multi-language translation, parameter interpolation, pluralization, and Accept-Language auto-detection.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SKIP_OVERRIDE } from '../plugins/plugin.js';

export interface I18nOptions {
  locales: string[];
  defaultLocale: string;
  loadPath?: string;
  translations?: Record<string, Record<string, any>>;
}

export class I18nManager {
  public locales: string[];
  public defaultLocale: string;
  private translations = new Map<string, Record<string, any>>();

  constructor(options: I18nOptions) {
    this.locales = options.locales;
    this.defaultLocale = options.defaultLocale;

    if (options.translations) {
      for (const [locale, dict] of Object.entries(options.translations)) {
        this.addTranslations(locale, dict);
      }
    }

    if (options.loadPath) {
      this.load(options.loadPath);
    }
  }

  /**
   * Adds an in-memory dictionary for a specific locale.
   */
  public addTranslations(locale: string, dict: Record<string, any>): this {
    const existing = this.translations.get(locale) || {};
    this.translations.set(locale, { ...existing, ...dict });
    return this;
  }

  /**
   * Loads locale JSON files from disk matching pattern (e.g. `./lang/{locale}.json`).
   */
  public load(pattern: string): void {
    for (const locale of this.locales) {
      const filePath = path.resolve(process.cwd(), pattern.replace('{locale}', locale));
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          this.addTranslations(locale, data);
        } catch {
          // Ignore JSON read errors
        }
      }
    }
  }

  /**
   * Resolves a nested key from dictionary (e.g. "queue.call").
   */
  private resolveKey(dict: Record<string, any>, key: string): any {
    if (!dict) return undefined;
    if (dict[key] !== undefined) return dict[key];

    const parts = key.split('.');
    let curr = dict;
    for (const part of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  /**
   * Translate a message key with parameter interpolation and pluralization.
   */
  public t(key: string, params?: Record<string, any>, locale?: string): string {
    const activeLocale = locale || this.defaultLocale;
    const dict = this.translations.get(activeLocale) || this.translations.get(this.defaultLocale) || {};

    let template: any = undefined;

    // Handle Pluralization if params.count is defined
    if (params && typeof params.count === 'number') {
      const isOne = params.count === 1;
      const countSuffix = isOne ? '_one' : '_other';

      // Check key_one / key_other
      template = this.resolveKey(dict, key + countSuffix);

      // Check object with .one / .other
      if (template === undefined) {
        const pluralObj = this.resolveKey(dict, key);
        if (typeof pluralObj === 'object' && pluralObj !== null) {
          template = isOne ? pluralObj.one : pluralObj.other;
        }
      }
    }

    if (template === undefined) {
      template = this.resolveKey(dict, key);
    }

    // Fallback to default locale if not found in current locale
    if (template === undefined && activeLocale !== this.defaultLocale) {
      const fallbackDict = this.translations.get(this.defaultLocale) || {};
      template = this.resolveKey(fallbackDict, key);
    }

    // Fallback to key itself if missing
    if (template === undefined) {
      return key;
    }

    if (typeof template !== 'string') {
      return String(template);
    }

    // Interpolate {placeholder} parameters
    if (params) {
      return template.replace(/{([^{}]+)}/g, (_, p) => {
        const val = params[p.trim()];
        return val !== undefined ? String(val) : `{${p}}`;
      });
    }

    return template;
  }

  /**
   * Detects locale from Accept-Language header or falls back to defaultLocale.
   */
  public detectLocale(header?: string): string {
    if (!header) return this.defaultLocale;

    const parts = header.split(',').map((part) => {
      const [lang] = part.trim().split(';');
      return (lang || '').toLowerCase();
    }).filter(Boolean);


    for (const part of parts) {
      // Exact match e.g. 'bn'
      const matched = this.locales.find((l) => l.toLowerCase() === part);
      if (matched) return matched;

      // Prefix match e.g. 'en-US' -> 'en'
      const prefix = part.split('-')[0];
      const prefixMatched = this.locales.find((l) => l.toLowerCase() === prefix);
      if (prefixMatched) return prefixMatched;
    }

    return this.defaultLocale;
  }
}

/**
 * AeroJS I18n Plugin
 */
export function i18nPlugin(options: I18nOptions) {
  const manager = new I18nManager(options);

  const plugin = function (app: any) {
    app.container.singleton('i18n', () => manager);

    // Context middleware to detect locale and attach t()
    app.use(async (ctx: any, next: any) => {
      const queryLang = ctx.req.query?.lang as string | undefined;
      const headerLang = ctx.req.headers?.['accept-language'];
      ctx.locale = queryLang && manager.locales.includes(queryLang)
        ? queryLang
        : manager.detectLocale(headerLang);

      ctx.t = (key: string, params?: Record<string, any>) => manager.t(key, params, ctx.locale);

      await next();
    });
  };

  (plugin as any)[SKIP_OVERRIDE] = true;
  return plugin;
}
