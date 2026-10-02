/**
 * @file local-driver.ts
 * @description Local filesystem storage driver for AeroJS.
 * Features safe path traversal prevention, recursive directory creation, and public URL mapping.
 */

import { readFile, writeFile, unlink, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname, normalize } from 'node:path';
import { UrlSigner } from '../../security/signed-url.js';
import type { StorageDriver } from './storage-driver.js';

export interface LocalStorageOptions {
  root: string;
  baseUrl?: string;
}

export class LocalStorageDriver implements StorageDriver {
  private root: string;
  private baseUrl: string;

  constructor(options: LocalStorageOptions) {
    this.root = resolve(options.root);
    this.baseUrl = options.baseUrl || '/storage';
  }

  public async put(path: string, content: Buffer | Uint8Array | string): Promise<string> {
    const fullPath = this.resolveSafePath(path);
    await mkdir(dirname(fullPath), { recursive: true });

    const buf = Buffer.isBuffer(content)
      ? content
      : typeof content === 'string'
      ? Buffer.from(content, 'utf-8')
      : Buffer.from(content);

    await writeFile(fullPath, buf);
    return this.normalizeRelative(path);
  }

  public async get(path: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(path);
    return await readFile(fullPath);
  }

  public async getText(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const buf = await this.get(path);
    return buf.toString(encoding);
  }

  public async exists(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolveSafePath(path);
      await stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  public async delete(path: string): Promise<boolean> {
    try {
      const fullPath = this.resolveSafePath(path);
      await unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  public async size(path: string): Promise<number> {
    const fullPath = this.resolveSafePath(path);
    const s = await stat(fullPath);
    return s.size;
  }

  public url(path: string): string {
    const rel = this.normalizeRelative(path);
    return `${this.baseUrl}/${rel}`.replace(/\/+/g, '/');
  }

  public async temporaryUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const rawUrl = this.url(path);
    return UrlSigner.sign(rawUrl, { expiresIn: expiresInSeconds });
  }

  public resolveSafePath(path: string): string {
    const cleanRel = path.replace(/^[\\/]+/, '');
    const target = resolve(this.root, cleanRel);
    if (!target.startsWith(this.root)) {
      throw new Error(`Path traversal violation: "${path}" is outside storage root.`);
    }
    return target;
  }

  private normalizeRelative(path: string): string {
    return normalize(path).replace(/^[\\/]+/, '').replace(/\\/g, '/');
  }
}
