/**
 * @file totp.ts
 * @description Zero-dependency implementation of RFC 6238 Time-Based One-Time Password (TOTP)
 * and RFC 4226 HMAC-Based One-Time Password (HOTP) using node:crypto.
 */

import * as crypto from 'node:crypto';

export class Totp {
  /**
   * Generates a base32 TOTP secret and a corresponding otpauth:// URI.
   */
  public static generateSecret(options: { issuer?: string; label?: string; length?: number } = {}) {
    const length = options.length || 20; // 20 bytes is standard for Google Authenticator (160 bits)
    const secretBuffer = crypto.randomBytes(length);
    const base32Secret = this.base32Encode(secretBuffer);

    let uri = `otpauth://totp/`;
    const label = encodeURIComponent(options.label || 'AeroJS');
    uri += label;
    uri += `?secret=${base32Secret}`;

    if (options.issuer) {
      uri += `&issuer=${encodeURIComponent(options.issuer)}`;
    }

    return {
      secret: base32Secret,
      uri
    };
  }

  /**
   * Verifies a TOTP token against a secret.
   * @param token The 6-digit user input token
   * @param secret The base32 secret
   * @param options window: number of 30-second steps to allow before/after current time (drift)
   */
  public static verify(token: string, secret: string, options: { window?: number; time?: number } = {}): boolean {
    const window = options.window ?? 1;
    const time = options.time || Date.now();
    const counter = Math.floor(time / 1000 / 30);

    const secretBuffer = this.base32Decode(secret);

    // Check current time window, then past windows, then future windows
    for (let i = -window; i <= window; i++) {
      const computedToken = this.hotp(secretBuffer, counter + i);
      // Use timing-safe equal to prevent timing attacks
      if (crypto.timingSafeEqual(Buffer.from(computedToken), Buffer.from(token.padStart(6, '0')))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generates recovery/backup codes for 2FA.
   * Returns plain codes to show to the user, and hashed codes to store in DB.
   */
  public static generateBackupCodes(count = 8) {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      // 8 character random hex codes
      const code = crypto.randomBytes(4).toString('hex').toLowerCase();
      plainCodes.push(code);
      const hash = crypto.createHash('sha256').update(code).digest('hex');
      hashedCodes.push(hash);
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * RFC 4226 HOTP algorithm.
   */
  private static hotp(secret: Buffer, counter: number): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter), 0);

    const hmac = crypto.createHmac('sha1', secret);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1]! & 0xf;
    const binary =
      ((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  private static base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i]!;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private static base32Decode(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let index = 0;
    const output = Buffer.alloc(Math.ceil((encoded.length * 5) / 8));

    for (let i = 0; i < encoded.length; i++) {
      const char = encoded[i]!.toUpperCase();
      if (char === '=' || char === ' ') continue;

      const charIndex = alphabet.indexOf(char);
      if (charIndex === -1) throw new Error('Invalid base32 character');

      value = (value << 5) | charIndex;
      bits += 5;

      if (bits >= 8) {
        output[index++] = (value >>> (bits - 8)) & 255;
        bits -= 8;
      }
    }

    return output.subarray(0, index);
  }
}
