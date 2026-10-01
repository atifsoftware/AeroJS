import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Totp } from '../src/security/totp.js';
import { EnvVault } from '../src/security/vault.js';
import { AeroContext } from '../src/core/context.js';
import { AeroRequest } from '../src/core/request.js';
import { AeroResponse } from '../src/core/response.js';
import { IncomingMessage, ServerResponse } from 'node:http';

describe('Advanced Security (TOTP, Vault, Encrypted Cookies)', () => {
  describe('TOTP (RFC 6238)', () => {
    it('generates a base32 secret and otpauth URI', () => {
      const res = Totp.generateSecret({ issuer: 'MyCorp', label: 'john@example.com' });
      expect(res.secret).toMatch(/^[A-Z2-7]+$/);
      expect(res.uri).toMatch(/^otpauth:\/\/totp\/john%40example.com\?secret=[A-Z2-7]+&issuer=MyCorp$/);
    });

    it('verifies a valid TOTP token and rejects an invalid one', () => {
      const res = Totp.generateSecret();

      // Calculate token for current time manually or assume one
      // Since it's time-based, we'll use a mocked fixed time for tests
      const fixedTime = 1600000000000;

      const counter = Math.floor(fixedTime / 1000 / 30);
      const counterBuffer = Buffer.alloc(8);
      counterBuffer.writeBigInt64BE(BigInt(counter), 0);

      // We need the raw base32 decoding logic from the class for the test,
      // but since it's private, we can access it using any or just test drift directly
      const validToken = (Totp as any).hotp((Totp as any).base32Decode(res.secret), counter);

      expect(Totp.verify(validToken, res.secret, { time: fixedTime })).toBe(true);
      expect(Totp.verify('123456', res.secret, { time: fixedTime })).toBe(false);
    });

    it('verifies TOTP token within a drift window', () => {
      const res = Totp.generateSecret();
      const fixedTime = 1600000000000;
      const counter = Math.floor(fixedTime / 1000 / 30);
      const previousToken = (Totp as any).hotp((Totp as any).base32Decode(res.secret), counter - 1);

      // With default window=1, previous step token should be valid
      expect(Totp.verify(previousToken, res.secret, { time: fixedTime, window: 1 })).toBe(true);
      // But outside window=0, it should fail
      expect(Totp.verify(previousToken, res.secret, { time: fixedTime, window: 0 })).toBe(false);
    });

    it('generates hashed backup codes', () => {
      const { plainCodes, hashedCodes } = Totp.generateBackupCodes(8);
      expect(plainCodes.length).toBe(8);
      expect(hashedCodes.length).toBe(8);
      expect(plainCodes[0]?.length).toBe(8); // 4 bytes hex
      expect(hashedCodes[0]?.length).toBe(64); // sha256 hex
    });
  });

  describe('Environment Vault (.env.vault)', () => {
    const testEnvPath = path.join(__dirname, '.env.test');
    const testVaultPath = path.join(__dirname, '.env.test.vault');
    let generatedKey: string;

    beforeEach(() => {
      fs.writeFileSync(testEnvPath, 'TEST_VAR="hello world"\nSECRET=123');
      generatedKey = EnvVault.generateKey();
      process.env['AERO_KEY'] = generatedKey;
    });

    afterEach(() => {
      if (fs.existsSync(testEnvPath)) fs.unlinkSync(testEnvPath);
      if (fs.existsSync(testVaultPath)) fs.unlinkSync(testVaultPath);
      delete process.env['AERO_KEY'];
    });

    it('encrypts and decrypts environment files securely', () => {
      EnvVault.syncToVault(testEnvPath, testVaultPath, generatedKey);

      const vaultContent = fs.readFileSync(testVaultPath, 'utf8');
      expect(vaultContent).toContain('AERO_VAULT="');

      const match = vaultContent.match(/AERO_VAULT="([^"]+)"/);
      expect(match).not.toBeNull();

      const decrypted = EnvVault.decrypt(match![1], generatedKey);
      expect(decrypted).toBe('TEST_VAR="hello world"\nSECRET=123');
    });

    it('rejects decryption if the payload was tampered with', () => {
      EnvVault.syncToVault(testEnvPath, testVaultPath, generatedKey);
      const vaultContent = fs.readFileSync(testVaultPath, 'utf8');
      const match = vaultContent.match(/AERO_VAULT="([^"]+)"/);

      // Tamper with the ciphertext (3rd part)
      const parts = match![1].split(':');
      parts[2] = parts[2].replace('a', 'b').replace('1', '2');
      const tamperedPayload = parts.join(':');

      expect(() => {
        EnvVault.decrypt(tamperedPayload, generatedKey);
      }).toThrow(/Unsupported state or unable to authenticate data/); // node:crypto throws this for auth tag mismatch
    });
  });

  describe('AES-256-GCM Encrypted Cookies', () => {
    let ctx: AeroContext;
    let resHeaders: Record<string, string[]> = {};

    beforeEach(() => {
      resHeaders = {};
      const reqMock = { headers: {} } as unknown as IncomingMessage;
      const resMock = {
        setHeader(k: string, v: string[] | string) { resHeaders[k.toLowerCase()] = Array.isArray(v) ? v : [v]; },
        getHeader(k: string) { return resHeaders[k.toLowerCase()]; }
      } as unknown as ServerResponse;

      ctx = new AeroContext(reqMock, resMock);
      process.env['AERO_KEY'] = EnvVault.generateKey();
    });

    afterEach(() => {
      delete process.env['AERO_KEY'];
    });

    it('encrypts cookie values', () => {
      ctx.setEncryptedCookie('secret_session', 'my_sensitive_data');

      const cookieHeader = resHeaders['set-cookie']![0];
      expect(cookieHeader).toContain('secret_session=');
      expect(cookieHeader).not.toContain('my_sensitive_data');

      const payload = decodeURIComponent(cookieHeader!.split('=')[1]!.split(';')[0] as string);
      expect(payload).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/); // IV:AuthTag:Ciphertext
    });

    it('decrypts valid cookie values', () => {
      ctx.setEncryptedCookie('secret_session', 'my_sensitive_data');
      const payload = decodeURIComponent(resHeaders['set-cookie']![0]!.split('=')[1]!.split(';')[0] as string);

      // Mock request to include the cookie
      (ctx.req.raw.headers as any).cookie = `secret_session=${payload}`;

      const decrypted = ctx.getEncryptedCookie('secret_session');
      expect(decrypted).toBe('my_sensitive_data');
    });

    it('returns undefined if cookie is tampered with', () => {
      ctx.setEncryptedCookie('secret_session', 'my_sensitive_data');
      const payload = decodeURIComponent(resHeaders['set-cookie']![0]!.split('=')[1]!.split(';')[0] as string);

      // Tamper
      const tampered = payload!.replace('a', 'b').replace('0', '1');
      (ctx.req.raw.headers as any).cookie = `secret_session=${tampered}`;

      const decrypted = ctx.getEncryptedCookie('secret_session');
      expect(decrypted).toBeUndefined(); // Silent fail, returns undefined
    });
  });
});
