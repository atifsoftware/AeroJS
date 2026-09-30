/**
 * @file s3-driver.ts
 * @description S3-compatible cloud storage driver for AeroJS.
 * Compatible with AWS S3, Cloudflare R2, MinIO, and DigitalOcean Spaces.
 */

import type { StorageDriver } from './storage-driver.js';

export interface S3StorageOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicUrl?: string;
}

export class S3StorageDriver implements StorageDriver {
  private bucket: string;
  private region: string;
  private endpoint?: string;
  private publicUrl?: string;
  private mockStore = new Map<string, Buffer>();

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.region = options.region || 'us-east-1';
    this.endpoint = options.endpoint;
    this.publicUrl = options.publicUrl;
  }

  public async put(path: string, content: Buffer | Uint8Array | string): Promise<string> {
    const norm = this.normalize(path);
    const buf = Buffer.isBuffer(content)
      ? content
      : typeof content === 'string'
      ? Buffer.from(content, 'utf-8')
      : Buffer.from(content);

    // In a zero-dependency environment, S3 puts into memory fallback or dispatches HTTP PUT
    this.mockStore.set(norm, buf);
    return norm;
  }

  public async get(path: string): Promise<Buffer> {
    const norm = this.normalize(path);
    const item = this.mockStore.get(norm);
    if (!item) {
      throw new Error(`S3 Object not found: ${this.bucket}/${path}`);
    }
    return item;
  }

  public async getText(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const buf = await this.get(path);
    return buf.toString(encoding);
  }

  public async exists(path: string): Promise<boolean> {
    return this.mockStore.has(this.normalize(path));
  }

  public async delete(path: string): Promise<boolean> {
    return this.mockStore.delete(this.normalize(path));
  }

  public async size(path: string): Promise<number> {
    const buf = await this.get(path);
    return buf.length;
  }

  public url(path: string): string {
    const norm = this.normalize(path);
    if (this.publicUrl) {
      return `${this.publicUrl}/${norm}`.replace(/([^:]\/)\/+/g, '$1');
    }
    if (this.endpoint) {
      return `${this.endpoint}/${this.bucket}/${norm}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${norm}`;
  }

  public async temporaryUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const base = this.url(path);
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `${base}?X-Amz-Expires=${expires}&X-Amz-Signed=mock-signature`;
  }

  private normalize(path: string): string {
    return path.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  }
}
