import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  Aero,
  Storage,
  LocalStorageDriver,
  MemoryStorageDriver,
  S3StorageDriver,
  UploadedFile,
} from '../src/index.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('AeroJS Storage & File Upload Manager (Step 4)', () => {
  const tempStorageDir = join(process.cwd(), 'temp_test_storage');

  beforeAll(() => {
    Storage.reset();
  });

  afterAll(() => {
    if (existsSync(tempStorageDir)) {
      rmSync(tempStorageDir, { recursive: true, force: true });
    }
  });

  describe('MemoryStorageDriver', () => {
    it('supports put, get, exists, size, and delete in-memory', async () => {
      const driver = new MemoryStorageDriver({ baseUrl: '/cdn' });

      await driver.put('reports/annual.txt', 'Revenue: $1M');
      expect(await driver.exists('reports/annual.txt')).toBe(true);
      expect(await driver.getText('reports/annual.txt')).toBe('Revenue: $1M');
      expect(await driver.size('reports/annual.txt')).toBe(12);
      expect(driver.url('reports/annual.txt')).toBe('/cdn/reports/annual.txt');

      await driver.delete('reports/annual.txt');
      expect(await driver.exists('reports/annual.txt')).toBe(false);
    });
  });

  describe('LocalStorageDriver', () => {
    it('persists files to local disk and prevents directory traversal attacks', async () => {
      const driver = new LocalStorageDriver({
        root: tempStorageDir,
        baseUrl: '/media',
      });

      await driver.put('avatars/user_1.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      expect(await driver.exists('avatars/user_1.png')).toBe(true);

      const buf = await driver.get('avatars/user_1.png');
      expect(buf).toHaveLength(4);
      expect(driver.url('avatars/user_1.png')).toBe('/media/avatars/user_1.png');

      // Traversal protection
      await expect(driver.get('../../etc/passwd')).rejects.toThrow('Path traversal violation');

      await driver.delete('avatars/user_1.png');
      expect(await driver.exists('avatars/user_1.png')).toBe(false);
    });
  });

  describe('S3StorageDriver', () => {
    it('manages cloud storage URLs and temporary signed links', async () => {
      const driver = new S3StorageDriver({
        bucket: 'my-production-bucket',
        region: 'ap-southeast-1',
        publicUrl: 'https://cdn.aerojs.org',
      });

      await driver.put('invoices/inv_101.pdf', 'PDF-DATA');
      expect(driver.url('invoices/inv_101.pdf')).toBe('https://cdn.aerojs.org/invoices/inv_101.pdf');

      const tempUrl = await driver.temporaryUrl('invoices/inv_101.pdf', 1800);
      expect(tempUrl).toContain('X-Amz-Expires=');
    });
  });

  describe('Storage Manager Multi-Disk Facade', () => {
    it('configures and switches between multiple disks seamlessly', async () => {
      Storage.configure({
        default: 'memory',
        disks: {
          memory: { driver: 'memory' },
          local: { driver: 'local', root: tempStorageDir },
          s3: { driver: 's3', bucket: 'backup-bucket' },
        },
      });

      // Default disk is memory
      await Storage.put('config.json', '{"app":"Aero"}');
      expect(await Storage.getText('config.json')).toBe('{"app":"Aero"}');

      // Named disk access
      await Storage.disk('s3').put('backup.sql', 'CREATE TABLE test;');
      expect(Storage.disk('s3').url('backup.sql')).toContain('backup-bucket');
    });
  });

  describe('UploadedFile & HTTP Multipart Form Upload', () => {
    it('validates file size, mime type, and extension', () => {
      const file = new UploadedFile({
        fieldName: 'avatar',
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.alloc(500),
      });

      expect(file.extension).toBe('.jpg');
      expect(file.size).toBe(500);

      // 1. Valid rules
      const checkValid = file.validate({
        maxSize: 1000,
        mimes: ['image/jpeg', 'image/png'],
        extensions: ['.jpg', '.png'],
      });
      expect(checkValid.valid).toBe(true);

      // 2. Fails maxSize
      const checkSize = file.validate({ maxSize: 200 });
      expect(checkSize.valid).toBe(false);
      expect(checkSize.errors[0]).toContain('exceeds maximum allowed limit');

      // 3. Fails MIME
      const checkMime = file.validate({ mimes: ['application/pdf'] });
      expect(checkMime.valid).toBe(false);
      expect(checkMime.errors[0]).toContain('Invalid file MIME type');
    });

    it('receives multipart/form-data upload in Aero route and accesses ctx.file', async () => {
      const app = new Aero();

      app.post('/upload', async (ctx) => {
        const file = ctx.file('document');
        if (!file) {
          ctx.status(400).json({ error: 'No file uploaded' });
          return;
        }

        const validation = file.validate({
          maxSize: 1024 * 1024,
          extensions: ['.txt'],
        });

        if (!validation.valid) {
          ctx.status(422).json({ error: validation.errors[0] });
          return;
        }

        const storedPath = await file.store('docs', 'memory');

        ctx.status(201).json({
          title: (ctx.body as any)?.title,
          originalName: file.originalName,
          storedPath,
        });
      });

      const client = createTestClient(app);

      // Construct raw multipart body
      const boundary = '----AeroBoundaryXYZ789';
      const fileContent = 'Aero Framework Whitepaper Content';

      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nFramework Specs\r\n`),
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="whitepaper.txt"\r\nContent-Type: text/plain\r\n\r\n${fileContent}\r\n`
        ),
        Buffer.from(`--${boundary}--\r\n`),
      ]);

      const res = await client.post('/upload', {
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body: payload,
      });

      expect(res.status).toBe(201);
      const json = res.json();
      expect(json.title).toBe('Framework Specs');
      expect(json.originalName).toBe('whitepaper.txt');
      expect(json.storedPath).toContain('docs/');
    });
  });
});
