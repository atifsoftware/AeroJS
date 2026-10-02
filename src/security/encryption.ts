/**
 * @file encryption.ts
 * @description Enterprise-grade authenticated encryption (AES-256-GCM) for AeroJS.
 * Supports transparent model field encryption, arbitrary object encryption, and secure key derivation.
 */

import * as crypto from 'node:crypto';

export interface EncrypterOptions {
  key?: string;
  cipher?: string;
}

export class Encrypter {
  private keyBuffer: Buffer;
  public readonly cipher: string = 'aes-256-gcm';
  private static defaultInstance?: Encrypter;

  constructor(key?: string) {
    const rawKey = key || process.env['APP_KEY'] || process.env['AERO_KEY'] || 'aerojs-default-encryption-secret-key-32bytes!';
    this.keyBuffer = Encrypter.normalizeKey(rawKey);
  }

  /**
   * Generates a cryptographically random 32-byte key encoded as a hex string.
   */
  public static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Normalizes any key string into a 32-byte Buffer.
   */
  public static normalizeKey(key: string): Buffer {
    if (key.startsWith('base64:')) {
      const buf = Buffer.from(key.slice(7), 'base64');
      if (buf.length === 32) return buf;
    }
    // If it's a 64-char hex string
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      return Buffer.from(key, 'hex');
    }
    const buf = Buffer.from(key, 'utf8');
    if (buf.length === 32) return buf;
    // Otherwise hash to 32 bytes with SHA-256
    return crypto.createHash('sha256').update(key).digest();
  }

  /**
   * Encrypts any serializable value (string, object, number, boolean) using AES-256-GCM.
   * Returns a compact token formatted as `aero:enc:<iv>:<authTag>:<ciphertext>`.
   */
  public encrypt(value: unknown): string {
    const serialized = JSON.stringify(value);
    const iv = crypto.randomBytes(12); // standard 96-bit IV
    const cipher = crypto.createCipheriv(this.cipher, this.keyBuffer, iv) as any;

    let encrypted = cipher.update(serialized, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `aero:enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts an AES-256-GCM encrypted payload produced by `encrypt`.
   */
  public decrypt<T = any>(payload: string): T {
    if (!Encrypter.isEncrypted(payload)) {
      throw new Error('Invalid encryption payload: missing aero:enc prefix');
    }

    const parts = payload.slice(9).split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encryption payload format. Expected iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex!, 'hex');
    const authTag = Buffer.from(authTagHex!, 'hex');

    const decipher = (crypto.createDecipheriv as any)(this.cipher, this.keyBuffer, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as T;
  }

  /**
   * Encrypts a string directly.
   */
  public encryptString(text: string): string {
    return this.encrypt(text);
  }

  /**
   * Decrypts an encrypted string directly.
   */
  public decryptString(payload: string): string {
    return this.decrypt<string>(payload);
  }

  /**
   * Checks whether a value is an encrypted payload string.
   */
  public static isEncrypted(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith('aero:enc:');
  }

  /**
   * Returns the shared singleton instance.
   */
  public static getInstance(): Encrypter {
    if (!this.defaultInstance) {
      this.defaultInstance = new Encrypter();
    }
    return this.defaultInstance;
  }
}

/**
 * Global Crypt facade for easy application-wide encryption and decryption.
 */
export const Crypt = {
  encrypt: (value: unknown, key?: string): string => {
    return key ? new Encrypter(key).encrypt(value) : Encrypter.getInstance().encrypt(value);
  },
  decrypt: <T = any>(payload: string, key?: string): T => {
    return key ? new Encrypter(key).decrypt<T>(payload) : Encrypter.getInstance().decrypt<T>(payload);
  },
  encryptString: (text: string, key?: string): string => {
    return key ? new Encrypter(key).encryptString(text) : Encrypter.getInstance().encryptString(text);
  },
  decryptString: (payload: string, key?: string): string => {
    return key ? new Encrypter(key).decryptString(payload) : Encrypter.getInstance().decryptString(payload);
  },
  generateKey: (): string => Encrypter.generateKey(),
  isEncrypted: (value: unknown): boolean => Encrypter.isEncrypted(value),
};
