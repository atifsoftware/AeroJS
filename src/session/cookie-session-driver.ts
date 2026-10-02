/**
 * @file cookie-session-driver.ts
 * @description Encrypted client-side cookie session driver for AeroJS.
 * Serializes and encrypts session state into an authenticated AES-256-GCM cookie.
 * Zero-dependency, stateless, and ideal for serverless / edge deployments.
 */

import type { SessionDriver } from './session-driver.js';
import { Encrypter } from '../security/encryption.js';

export class CookieSessionDriver implements SessionDriver {
  public readonly isClientSide = true;
  private encrypter: Encrypter;
  private lastPayload = '';

  constructor(key?: string) {
    this.encrypter = new Encrypter(key);
  }

  /**
   * Reads and decrypts session data from the encrypted cookie payload.
   */
  public async read(sessionIdOrPayload: string): Promise<Record<string, unknown>> {
    if (!sessionIdOrPayload || !Encrypter.isEncrypted(sessionIdOrPayload)) {
      return {};
    }
    try {
      const data = this.encrypter.decrypt<Record<string, unknown>>(sessionIdOrPayload);
      if (data && typeof data === 'object') {
        return data;
      }
      return {};
    } catch {
      // Tampered or invalid ciphertext -> reset session
      return {};
    }
  }

  /**
   * Encrypts the session state for writing to the client cookie.
   */
  public async write(sessionId: string, data: Record<string, unknown>, _ttl: number): Promise<void> {
    this.lastPayload = this.encrypter.encrypt(data);
  }

  /**
   * Returns the encrypted cookie ciphertext string for the given session state.
   */
  public getEncryptedCookieValue(data: Record<string, unknown>): string {
    return this.encrypter.encrypt(data);
  }

  /**
   * Destroys the session state.
   */
  public async destroy(_sessionId: string): Promise<void> {
    this.lastPayload = '';
  }

  /**
   * Garbage collection is a no-op for client-side cookies as browsers manage expiry.
   */
  public async gc(): Promise<void> {}
}
