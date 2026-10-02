/**
 * @file signed-url.ts
 * @description Tamper-proof HMAC URL Signing & Validation for AeroJS.
 * Supports temporary expiring signed URLs for private downloads, password resets, and webhooks.
 */

import * as crypto from 'node:crypto';
import type { Middleware, NextFunction } from '../core/types.js';
import type { AeroContext } from '../core/context.js';
import { ForbiddenError } from '../core/errors.js';

export interface SignUrlOptions {
  expiresIn?: number; // Expiration duration in seconds (e.g. 900 for 15 minutes)
  key?: string; // Optional custom secret key (defaults to APP_KEY or AERO_KEY or fallback)
}

export class UrlSigner {
  private static defaultKey: string = process.env.APP_KEY || process.env.AERO_KEY || 'aero-default-signing-secret-key-32chars';

  public static setDefaultKey(key: string): void {
    this.defaultKey = key;
  }

  public static getDefaultKey(): string {
    return this.defaultKey;
  }

  /**
   * Generates a signed URL with timestamp and HMAC signature.
   */
  public static sign(url: string, options: SignUrlOptions = {}): string {
    const key = options.key || this.defaultKey;
    const urlObj = new URL(url, 'http://localhost');
    const expiresIn = options.expiresIn ?? 3600; // Default: 1 hour
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    urlObj.searchParams.set('expires', String(expiresAt));
    // Remove old signature if present
    urlObj.searchParams.delete('signature');

    // Create signature payload: pathname + sorted query string
    const payload = this.getPayload(urlObj);
    const signature = crypto.createHmac('sha256', key).update(payload).digest('hex');

    urlObj.searchParams.set('signature', signature);

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return urlObj.toString();
    }
    return `${urlObj.pathname}${urlObj.search}`;
  }

  /**
   * Verifies if a given URL has a valid and unexpired HMAC signature.
   */
  public static hasValidSignature(url: string, key?: string): boolean {
    const secret = key || this.defaultKey;
    const urlObj = new URL(url, 'http://localhost');

    const signature = urlObj.searchParams.get('signature');
    const expiresStr = urlObj.searchParams.get('expires');

    if (!signature || !expiresStr) {
      return false;
    }

    const expires = parseInt(expiresStr, 10);
    if (isNaN(expires)) {
      return false;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (now > expires) {
      return false;
    }

    // Remove signature to compute expected signature
    urlObj.searchParams.delete('signature');
    const payload = this.getPayload(urlObj);
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  private static getPayload(urlObj: URL): string {
    // Sort query keys for consistent hashing
    const params = Array.from(urlObj.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const sortedQuery = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return `${urlObj.pathname}?${sortedQuery}`;
  }
}

/**
 * Middleware that validates the incoming request has a valid, non-expired signed URL.
 */
export function validateSignedUrl(key?: string): Middleware {
  return async (ctx: AeroContext<any>, next: NextFunction) => {
    const fullUrl = ctx.req.url || '/';
    const isValid = UrlSigner.hasValidSignature(fullUrl, key);

    if (!isValid) {
      throw new ForbiddenError('Invalid or expired URL signature.');
    }

    await next();
  };
}
