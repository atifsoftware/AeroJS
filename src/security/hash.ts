/**
 * @file hash.ts
 * @description Zero-dependency, memory-hard Password Hashing & Verification Engine (scrypt) for AeroJS.
 * Powered by Node.js built-in `node:crypto`. Implements OWASP-recommended parameters and timing-safe comparison.
 */

import crypto from 'node:crypto';

export interface ScryptOptions {
  N?: number; // CPU/memory cost parameter (default: 16384 / 2^14)
  r?: number; // Block size parameter (default: 8)
  p?: number; // Parallelization parameter (default: 1)
  keyLen?: number; // Output key length in bytes (default: 32)
  saltLen?: number; // Salt length in bytes (default: 16)
}

export class Hash {
  private static defaultOptions: ScryptOptions = {
    N: 16384,
    r: 8,
    p: 1,
    keyLen: 32,
    saltLen: 16,
  };

  /**
   * Hashes a plaintext password using crypto.scrypt with a cryptographically secure random salt.
   */
  public static async make(password: string, options: ScryptOptions = {}): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };
    const salt = crypto.randomBytes(opts.saltLen!);

    return new Promise<string>((resolve, reject) => {
      crypto.scrypt(
        password,
        salt,
        opts.keyLen!,
        { N: opts.N, r: opts.r, p: opts.p },
        (err, derivedKey) => {
          if (err) return reject(err);
          const saltHex = salt.toString('hex');
          const hashHex = derivedKey.toString('hex');
          // Standard crypt format: $scrypt$N=16384,r=8,p=1$<saltHex>$<hashHex>
          resolve(`$scrypt$N=${opts.N},r=${opts.r},p=${opts.p}$${saltHex}$${hashHex}`);
        }
      );
    });
  }

  /**
   * Verifies a plaintext password against a stored scrypt hash using constant-time timingSafeEqual.
   */
  public static async verify(hash: string, password: string): Promise<boolean> {
    if (!hash || !password || !hash.startsWith('$scrypt$')) {
      return false;
    }

    try {
      const parts = hash.split('$');
      // Format: ["", "scrypt", "N=16384,r=8,p=1", "saltHex", "hashHex"]
      if (parts.length !== 5) return false;

      const paramsStr = parts[2]!;
      const saltHex = parts[3]!;
      const originalHashHex = parts[4]!;

      const params: Record<string, number> = {};
      for (const pair of paramsStr.split(',')) {
        const [k, v] = pair.split('=');
        if (k && v) params[k] = parseInt(v, 10);
      }

      const salt = Buffer.from(saltHex, 'hex');
      const expectedBuffer = Buffer.from(originalHashHex, 'hex');

      return new Promise<boolean>((resolve) => {
        crypto.scrypt(
          password,
          salt,
          expectedBuffer.length,
          { N: params['N'] || 16384, r: params['r'] || 8, p: params['p'] || 1 },
          (err, derivedKey) => {
            if (err) return resolve(false);
            if (derivedKey.length !== expectedBuffer.length) return resolve(false);
            resolve(crypto.timingSafeEqual(derivedKey, expectedBuffer));
          }
        );
      });
    } catch {
      return false;
    }
  }

  /**
   * Checks if the given hash needs to be rehashed with updated work factors.
   */
  public static needsRehash(hash: string, options: ScryptOptions = {}): boolean {
    const opts = { ...this.defaultOptions, ...options };
    if (!hash.startsWith('$scrypt$')) return true;

    const parts = hash.split('$');
    if (parts.length !== 5) return true;

    const paramsStr = parts[2]!;
    const expected = `N=${opts.N},r=${opts.r},p=${opts.p}`;
    return paramsStr !== expected;
  }
}

export const hash = (password: string, options?: ScryptOptions) => Hash.make(password, options);
export const hashVerify = (hashStr: string, password: string) => Hash.verify(hashStr, password);
