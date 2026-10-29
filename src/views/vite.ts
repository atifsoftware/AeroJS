/**
 * @file vite.ts
 * @description Official Vite integration helper for AeroJS.
 * Bridges Vite development server (Hot Module Replacement) and
 * production manifest.json bundles for Inertia.js (React / Vue 3) and MPAs.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ViteOptions {
  entry?: string | string[];
  buildDirectory?: string; // Default: 'public/build'
  manifestPath?: string;   // Default: 'public/build/manifest.json' or 'public/build/.vite/manifest.json'
  devServerUrl?: string;   // Default: 'http://localhost:5173'
  dev?: boolean;           // Force dev HMR mode or auto-detect
}

let cachedManifest: Record<string, { file: string; css?: string[] }> | null = null;

/**
 * Generates script and stylesheet HTML tags for Vite assets.
 * In development, points to the Vite HMR server (http://localhost:5173).
 * In production, resolves asset filenames and hashed CSS from manifest.json.
 */
export function vite(
  entry?: string | string[] | Partial<ViteOptions>,
  optionsArg: Partial<ViteOptions> = {}
): string {
  let entries: string[] = [];
  let options: Partial<ViteOptions> = optionsArg;

  if (typeof entry === 'string') {
    entries = [entry];
  } else if (Array.isArray(entry)) {
    entries = entry;
  } else if (entry && typeof entry === 'object') {
    options = { ...entry, ...optionsArg };
    if (options.entry) {
      entries = Array.isArray(options.entry) ? options.entry : [options.entry];
    }
  } else if (optionsArg.entry) {
    entries = Array.isArray(optionsArg.entry) ? optionsArg.entry : [optionsArg.entry];
  }

  entries = entries.filter((e): e is string => typeof e === 'string' && e.trim().length > 0);

  const buildDir = options.buildDirectory || 'public/build';
  const cleanBuildDir = buildDir.startsWith('public') ? buildDir.replace(/^public\/?/, '/') : `/${buildDir}`;

  // Multi-root discovery for hosting environments (Passenger, LiteSpeed, PM2, Docker, subdomains)
  const appRoots = [
    process.env.PASSENGER_APP_ROOT,
    process.env.APP_ROOT,
    process.cwd(),
  ].filter(Boolean) as string[];

  // Candidate manifest paths
  const candidatePaths: string[] = [];
  if (options.manifestPath) {
    candidatePaths.push(options.manifestPath);
  }
  for (const root of appRoots) {
    candidatePaths.push(join(root, buildDir, 'manifest.json'));
    candidatePaths.push(join(root, buildDir, '.vite', 'manifest.json'));
  }

  // Find first existing manifest
  const targetFile = candidatePaths.find((p) => existsSync(p));
  const hasManifest = Boolean(targetFile);

  // Check for hot reload indicator (created by vite dev server)
  let hotUrl = '';
  for (const root of appRoots) {
    const hotPath = join(root, 'public', 'hot');
    if (existsSync(hotPath)) {
      try {
        hotUrl = readFileSync(hotPath, 'utf-8').trim();
      } catch {}
      break;
    }
  }

  // In dev mode when hotUrl exists, options.dev is true, or no manifest in non-production
  const isDev = options.dev === true || Boolean(hotUrl) || (!hasManifest && process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production');
  const devServerUrl = options.devServerUrl || hotUrl || 'http://localhost:5173';

  if (isDev) {
    const clientScript = `<script type="module" src="${devServerUrl}/@vite/client"></script>`;
    if (entries.length === 0) {
      return clientScript;
    }
    const entryScripts = entries
      .map((e) => `<script type="module" src="${devServerUrl}/${e.replace(/^\/+/, '')}"></script>`)
      .join('\n');
    return `${clientScript}\n${entryScripts}`;
  }

  // Production: Resolve from manifest.json (in dev/non-production, re-read on change)
  if ((!cachedManifest || process.env.NODE_ENV !== 'production' || process.env.APP_ENV !== 'production') && targetFile) {
    try {
      cachedManifest = JSON.parse(readFileSync(targetFile, 'utf-8'));
    } catch {
      cachedManifest = null;
    }
  }

  const tags: string[] = [];

  for (const e of entries) {
    const key = e.replace(/^\/+/, '');
    const chunk = cachedManifest ? cachedManifest[key] : null;

    if (chunk) {
      if (chunk.css && Array.isArray(chunk.css)) {
        for (const cssFile of chunk.css) {
          tags.push(`<link rel="stylesheet" href="${cleanBuildDir}/${cssFile}">`);
        }
      }
      tags.push(`<script type="module" src="${cleanBuildDir}/${chunk.file}"></script>`);
    } else {
      tags.push(`<script type="module" src="${cleanBuildDir}/${key}"></script>`);
    }
  }

  return tags.join('\n');
}
