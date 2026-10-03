/**
 * @file vite.ts
 * @description Official Vite integration helper for AeroJS.
 * Bridges Vite development server (Hot Module Replacement) and
 * production manifest.json bundles for Inertia.js (React / Vue 3) and MPAs.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ViteOptions {
  entry: string | string[];
  buildDirectory?: string; // Default: 'public/build'
  manifestPath?: string;   // Default: 'public/build/manifest.json' or 'public/build/.vite/manifest.json'
  devServerUrl?: string;   // Default: 'http://localhost:5173'
}

let cachedManifest: Record<string, { file: string; css?: string[] }> | null = null;

/**
 * Generates script and stylesheet HTML tags for Vite assets.
 * In development, points to the Vite HMR server (http://localhost:5173).
 * In production, resolves asset filenames and hashed CSS from manifest.json.
 */
export function vite(entry: string | string[], options: Partial<ViteOptions> = {}): string {
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

  // If manifest exists on disk, we are definitely in production mode (even if developer omitted NODE_ENV)
  const hasManifest = Boolean(targetFile);
  const isDev = !hasManifest && process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production';
  const devServerUrl = options.devServerUrl || 'http://localhost:5173';
  const entries = Array.isArray(entry) ? entry : [entry];

  if (isDev) {
    const clientScript = `<script type="module" src="${devServerUrl}/@vite/client"></script>`;
    const entryScripts = entries
      .map((e) => `<script type="module" src="${devServerUrl}/${e.replace(/^\/+/, '')}"></script>`)
      .join('\n');
    return `${clientScript}\n${entryScripts}`;
  }

  // Production: Resolve from manifest.json
  if (!cachedManifest && targetFile) {
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
