/**
 * @file vault.ts
 * @description Encrypts and decrypts environment files into a secure .env.vault format
 * using AES-256-GCM authenticated encryption.
 */

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

export class EnvVault {
  /**
   * Generates a 32-byte encryption key encoded as hex.
   */
  public static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypts the contents of a .env file and writes it to .env.vault.
   * @param envContent The raw content of the .env file
   * @param keyHex The 32-byte hex key (AERO_KEY)
   */
  public static encrypt(envContent: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
      throw new Error('Encryption key must be exactly 32 bytes (64 hex characters).');
    }

    const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(envContent, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Format: IV:AuthTag:Ciphertext
    const payload = `${iv.toString('hex')}:${authTag}:${encrypted}`;
    return payload;
  }

  /**
   * Decrypts the contents of a .env.vault file.
   * @param vaultPayload The encrypted payload from .env.vault
   * @param keyHex The 32-byte hex key (AERO_KEY)
   */
  public static decrypt(vaultPayload: string, keyHex: string): string {
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
      throw new Error('Decryption key must be exactly 32 bytes (64 hex characters).');
    }

    const parts = vaultPayload.trim().split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid vault payload format. Expected IV:AuthTag:Ciphertext.');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex!, 'hex');
    const authTag = Buffer.from(authTagHex!, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex!, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Syncs a local .env file to a .env.vault file.
   */
  public static syncToVault(envPath = '.env', vaultPath = '.env.vault', keyHex?: string) {
    if (!fs.existsSync(envPath)) throw new Error(`.env file not found at ${envPath}`);

    const key = keyHex || process.env['AERO_KEY'] || process.env['DOTENV_PRIVATE_KEY'];
    if (!key) throw new Error('AERO_KEY or DOTENV_PRIVATE_KEY environment variable is required to encrypt.');

    const envContent = fs.readFileSync(envPath, 'utf8');
    const encrypted = this.encrypt(envContent, key);

    // Wrap in standard DOTENV_VAULT format or similar
    const vaultContent = `#/!\n# This file is encrypted. Do not edit manually.\n# Decrypt using AERO_KEY\nAERO_VAULT="${encrypted}"\n`;
    fs.writeFileSync(vaultPath, vaultContent);
  }
}
