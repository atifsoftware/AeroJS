/**
 * @file memory-driver.ts
 * @description In-memory storage driver for AeroJS.
 * Perfect for ephemeral cache, fast testing, and non-persistent uploads.
 */

import type { StorageDriver } from './storage-driver.js';
import { UrlSigner } from '../../security/signed-url.js';

export class MemoryStorageDriver implements StorageDriver {
  private files = new Map<string, Buffer>();
  private baseUrl: string;

  constructor(options: { baseUrl?: string } = {}) {
    this.baseUrl = options.baseUrl || '/storage';
  }

  public async put(path: string, content: Buffer | Uint8Array | string): Promise<string> {
    const norm = this.normalize(path);
    const buf = Buffer.isBuffer(content)
      ? content
      : typeof content === 'string'
      ? Buffer.from(content, 'utf-8')
      : Buffer.from(content);

    this.files.set(norm, buf);
    return norm;
  }

  public async get(path: string): Promise<Buffer> {
    const norm = this.normalize(path);
    const file = this.files.get(norm);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  }

  public async getText(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const buf = await this.get(path);
    return buf.toString(encoding);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(this.normalize(path));
  }

  public async delete(path: string): Promise<boolean> {
    return this.files.delete(this.normalize(path));
  }

  public async size(path: string): Promise<number> {
    const buf = await this.get(path);
    return buf.length;
  }

  public url(path: string): string {
    const norm = this.normalize(path);
    return `${this.baseUrl}/${norm}`.replace(/\/+/g, '/');
  }

  public async temporaryUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const rawUrl = this.url(path);
    return UrlSigner.sign(rawUrl, { expiresIn: expiresInSeconds });
  }

  public clear(): void {
    this.files.clear();
  }

  private normalize(path: string): string {
    return path.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  }
}
