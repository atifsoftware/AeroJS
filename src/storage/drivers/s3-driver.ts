import crypto from 'node:crypto';
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
  private accessKeyId?: string;
  private secretAccessKey?: string;
  private publicUrl?: string;
  private mockStore = new Map<string, Buffer>();

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.region = options.region || 'us-east-1';
    this.endpoint = options.endpoint;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.publicUrl = options.publicUrl;
  }

  private hasRealCredentials(): boolean {
    return Boolean(this.accessKeyId && this.secretAccessKey);
  }

  public async put(path: string, content: Buffer | Uint8Array | string): Promise<string> {
    const norm = this.normalize(path);
    const buf = Buffer.isBuffer(content)
      ? content
      : typeof content === 'string'
      ? Buffer.from(content, 'utf-8')
      : Buffer.from(content);

    if (!this.hasRealCredentials()) {
      // In-memory mock store for testing without AWS credentials
      this.mockStore.set(norm, buf);
      return norm;
    }

    const host = this.getHost();
    const url = this.getEndpointUrl(norm);
    const headers = this.signRequest('PUT', `/${norm}`, buf, host);

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: buf,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`S3 PUT failed with status ${res.status}: ${errText}`);
    }

    return norm;
  }

  public async get(path: string): Promise<Buffer> {
    const norm = this.normalize(path);
    if (!this.hasRealCredentials()) {
      const item = this.mockStore.get(norm);
      if (!item) {
        throw new Error(`S3 Object not found: ${this.bucket}/${path}`);
      }
      return item;
    }

    const host = this.getHost();
    const url = this.getEndpointUrl(norm);
    const headers = this.signRequest('GET', `/${norm}`, Buffer.alloc(0), host);

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (res.status === 404) {
      throw new Error(`S3 Object not found: ${this.bucket}/${path}`);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`S3 GET failed with status ${res.status}: ${errText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  public async getText(path: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const buf = await this.get(path);
    return buf.toString(encoding);
  }

  public async exists(path: string): Promise<boolean> {
    const norm = this.normalize(path);
    if (!this.hasRealCredentials()) {
      return this.mockStore.has(norm);
    }

    try {
      const host = this.getHost();
      const url = this.getEndpointUrl(norm);
      const headers = this.signRequest('HEAD', `/${norm}`, Buffer.alloc(0), host);
      const res = await fetch(url, { method: 'HEAD', headers });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async delete(path: string): Promise<boolean> {
    const norm = this.normalize(path);
    if (!this.hasRealCredentials()) {
      return this.mockStore.delete(norm);
    }

    try {
      const host = this.getHost();
      const url = this.getEndpointUrl(norm);
      const headers = this.signRequest('DELETE', `/${norm}`, Buffer.alloc(0), host);
      const res = await fetch(url, { method: 'DELETE', headers });
      return res.ok || res.status === 204;
    } catch {
      return false;
    }
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
    const norm = this.normalize(path);
    const base = this.url(path);
    if (!this.hasRealCredentials()) {
      const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
      return `${base}?X-Amz-Expires=${expires}&X-Amz-Signed=mock-signature`;
    }

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credential = `${this.accessKeyId}/${dateStamp}/${this.region}/s3/aws4_request`;

    const qs = [
      `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
      `X-Amz-Credential=${encodeURIComponent(credential)}`,
      `X-Amz-Date=${amzDate}`,
      `X-Amz-Expires=${expiresInSeconds}`,
      `X-Amz-SignedHeaders=host`,
    ].join('&');

    const canonicalReq = `GET\n/${norm}\n${qs}\nhost:${this.getHost()}\n\nhost\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/${this.region}/s3/aws4_request\n${crypto.createHash('sha256').update(canonicalReq).digest('hex')}`;
    const signingKey = this.getSignatureKey(this.secretAccessKey!, dateStamp, this.region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return `${base}?${qs}&X-Amz-Signature=${signature}`;
  }

  private normalize(path: string): string {
    return path.replace(/^[\\/]+/, '').replace(/\\/g, '/');
  }

  private getHost(): string {
    if (this.endpoint) {
      return new URL(this.endpoint).host;
    }
    return `${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  private getEndpointUrl(path: string): string {
    return `https://${this.getHost()}/${path}`;
  }

  private signRequest(
    method: string,
    canonicalUri: string,
    payload: Buffer,
    host: string
  ): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

    const signingKey = this.getSignatureKey(this.secretAccessKey!, dateStamp, this.region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      Host: host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authHeader,
    };
  }

  private getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    return crypto.createHmac('sha256', kService).update('aws4_request').digest();
  }
}
