/**
 * @file static.ts
 * @description Zero-dependency high-performance static asset server with caching and SPA fallback.
 */

import { statSync, createReadStream, existsSync } from 'node:fs';
import { resolve, join, extname, normalize, sep } from 'node:path';
import type { Middleware } from '../core/types.js';
import type { DefaultState } from '../core/context.js';

export interface StaticOptions {
  root: string;
  prefix?: string;
  index?: string;
  spa?: boolean;
  fallback?: string;
  maxAge?: number;
  etag?: boolean;
  dotfiles?: 'ignore' | 'deny' | 'allow';
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * Creates a static asset serving middleware supporting ETags, Cache-Control, and SPA routing fallback.
 */
export function serveStatic<State = DefaultState>(options: StaticOptions): Middleware<State> {
  const rootDir = resolve(options.root);
  const cleanPrefix = options.prefix ? `/${options.prefix.replace(/^\/+|\/+$/g, '')}` : '';
  const indexFile = options.index ?? 'index.html';
  const fallbackFile = options.fallback ?? indexFile;
  const isSpa = Boolean(options.spa);
  const maxAge = options.maxAge ?? 0;
  const enableEtag = options.etag !== false;
  const dotfiles = options.dotfiles ?? 'ignore';

  return async (ctx, next) => {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      return next();
    }

    const pathname = ctx.path;

    // Check if request matches prefix
    if (cleanPrefix && !pathname.startsWith(cleanPrefix)) {
      return next();
    }

    // Strip prefix
    let relativePath = cleanPrefix ? pathname.slice(cleanPrefix.length) : pathname;
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }

    // Prevent directory traversal attacks
    const safePath = normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    if (safePath.includes('..')) {
      return ctx.status(403).text('Forbidden: Directory traversal attempt');
    }

    // Dotfiles check
    const isDotfile = safePath.split(/[\/\\]/).some((segment) => segment.startsWith('.'));
    if (isDotfile) {
      if (dotfiles === 'deny') {
        return ctx.status(403).text('Forbidden: Access to dotfiles is denied');
      }
      if (dotfiles === 'ignore') {
        return next();
      }
    }

    let filePath = join(rootDir, safePath);

    // If path is directory or empty, append index file
    if (!safePath || safePath === '.') {
      filePath = join(rootDir, indexFile);
    }

    // Defense-in-depth: Ensure resolved target never escapes rootDir
    const resolvedPath = resolve(filePath);
    const normalizedRoot = rootDir.endsWith(sep) ? rootDir : rootDir + sep;
    if (resolvedPath !== rootDir && !resolvedPath.startsWith(normalizedRoot)) {
      return ctx.status(403).text('Forbidden: Directory traversal attempt');
    }

    let stat = existsSync(filePath) ? statSync(filePath) : null;

    if (stat && stat.isDirectory()) {
      filePath = join(filePath, indexFile);
      stat = existsSync(filePath) ? statSync(filePath) : null;
    }

    // SPA fallback handling
    if (!stat && isSpa && ctx.method === 'GET') {
      const acceptsHtml = ctx.req.get('accept')?.includes('text/html') || !extname(pathname);
      if (acceptsHtml) {
        filePath = join(rootDir, fallbackFile);
        stat = existsSync(filePath) ? statSync(filePath) : null;
      }
    }

    if (!stat || !stat.isFile()) {
      return next();
    }

    // Set caching headers
    const etagValue = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    if (enableEtag) {
      ctx.set('ETag', etagValue);
    }

    if (maxAge > 0) {
      ctx.set('Cache-Control', `public, max-age=${maxAge}`);
    } else {
      ctx.set('Cache-Control', 'no-cache');
    }

    // Conditional GET (304 Not Modified)
    if (enableEtag) {
      const clientEtag = ctx.req.get('if-none-match');
      if (clientEtag && clientEtag === etagValue) {
        return ctx.status(304).send(null);
      }
    }

    ctx.set('Content-Type', getMimeType(filePath));
    ctx.set('Content-Length', String(stat.size));

    if (ctx.method === 'HEAD') {
      return ctx.status(200).send(null);
    }

    ctx.status(200);
    const stream = createReadStream(filePath);
    ctx.send(stream);
  };
}
