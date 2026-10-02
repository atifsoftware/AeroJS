import { describe, it, expect } from 'vitest';
import { UrlSigner, validateSignedUrl } from '../src/security/signed-url.js';
import { Storage } from '../src/storage/storage-manager.js';
import { ForbiddenError } from '../src/core/errors.js';

describe('AeroJS Tamper-Proof Signed URLs', () => {
  it('generates signed URL with expiration timestamp and valid signature', () => {
    const signed = UrlSigner.sign('/download/invoice/45', { expiresIn: 600 });

    expect(signed).toContain('/download/invoice/45?');
    expect(signed).toContain('expires=');
    expect(signed).toContain('signature=');

    expect(UrlSigner.hasValidSignature(signed)).toBe(true);
  });

  it('preserves existing query parameters when signing', () => {
    const signed = UrlSigner.sign('/reports/statement?format=pdf&user=901', { expiresIn: 300 });

    expect(signed).toContain('format=pdf');
    expect(signed).toContain('user=901');
    expect(signed).toContain('signature=');

    expect(UrlSigner.hasValidSignature(signed)).toBe(true);
  });

  it('rejects tampered query parameters or pathnames', () => {
    const signed = UrlSigner.sign('/download/file?id=100', { expiresIn: 600 });
    expect(UrlSigner.hasValidSignature(signed)).toBe(true);

    // Tamper with query parameter: change id=100 to id=101
    const tamperedQuery = signed.replace('id=100', 'id=101');
    expect(UrlSigner.hasValidSignature(tamperedQuery)).toBe(false);

    // Tamper with pathname
    const tamperedPath = signed.replace('/download/file', '/download/admin-file');
    expect(UrlSigner.hasValidSignature(tamperedPath)).toBe(false);

    // Tamper with expiration timestamp
    const tamperedExpires = signed.replace(/expires=\d+/, 'expires=9999999999');
    expect(UrlSigner.hasValidSignature(tamperedExpires)).toBe(false);
  });

  it('rejects expired signed URLs', async () => {
    // Generate URL that expired in the past (-10 seconds)
    const expired = UrlSigner.sign('/temporary/link', { expiresIn: -10 });
    expect(UrlSigner.hasValidSignature(expired)).toBe(false);
  });

  it('validates signed URLs via validateSignedUrl middleware', async () => {
    const middleware = validateSignedUrl();

    let nextCalled = false;
    const next = async () => {
      nextCalled = true;
    };

    // 1. Valid request
    const validUrl = UrlSigner.sign('/secure/webhook?event=ping', { expiresIn: 60 });
    const validCtx = { req: { url: validUrl } } as any;

    await middleware(validCtx, next);
    expect(nextCalled).toBe(true);

    // 2. Tampered request -> Throws ForbiddenError
    const invalidCtx = { req: { url: '/secure/webhook?event=ping&signature=fake123' } } as any;
    await expect(middleware(invalidCtx, next)).rejects.toThrow(ForbiddenError);
  });

  it('generates signed temporary URLs via Storage facade', async () => {
    Storage.reset();
    Storage.configure({
      default: 'memory',
      disks: {
        memory: { driver: 'memory', baseUrl: '/storage' },
      },
    });

    await Storage.put('prescriptions/rx-123.pdf', 'Rx Content');
    const tempUrl = await Storage.temporaryUrl('prescriptions/rx-123.pdf', 900);

    expect(tempUrl).toContain('/storage/prescriptions/rx-123.pdf?');
    expect(tempUrl).toContain('signature=');
    expect(UrlSigner.hasValidSignature(tempUrl)).toBe(true);
  });
});
