import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { AeroResponse } from '../src/core/response.js';
import { ChunkedUploadManager } from '../src/storage/chunked-uploader.js';

describe('Streaming and Chunked Uploads', () => {
  const tempDir = path.join(__dirname, 'temp_test');
  const dummyFilePath = path.join(tempDir, 'dummy.txt');
  const dummyContent = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  beforeAll(async () => {
    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.writeFile(dummyFilePath, dummyContent);
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('HTTP 206 Partial Content Range Streaming', () => {
    it('serves full content when no range is provided', async () => {
      let writtenData = Buffer.alloc(0);

      const req = { headers: {} } as unknown as IncomingMessage;
      const resMock = {
        headersSent: false,
        writableEnded: false,
        statusCode: 200,
        headers: {} as Record<string, string>,
        setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
        getHeader(k: string) { return this.headers[k.toLowerCase()]; },
        removeHeader(k: string) { delete this.headers[k.toLowerCase()]; },
        write(chunk: any) { writtenData = Buffer.concat([writtenData, Buffer.from(chunk)]); },
        end(chunk?: any) { if (chunk) this.write(chunk); this.writableEnded = true; },
        on() { return this; },
        once() { return this; },
        emit() { return false; },
        destroy() {}
      } as unknown as ServerResponse;

      const response = new AeroResponse(resMock);
      await response.streamFile(req, dummyFilePath);

      // wait for stream pipeline
      await new Promise(r => setTimeout(r, 50));

      expect(response.statusCode).toBe(200);
      expect((resMock as any).headers['content-length']).toBe(dummyContent.length);
      expect(writtenData.toString()).toBe(dummyContent);
    });

    it('handles Range: bytes=0-9 (first 10 bytes)', async () => {
      let writtenData = Buffer.alloc(0);

      const req = { headers: { range: 'bytes=0-9' } } as unknown as IncomingMessage;
      const resMock = {
        headersSent: false,
        writableEnded: false,
        statusCode: 200,
        headers: {} as Record<string, string>,
        setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
        getHeader(k: string) { return this.headers[k.toLowerCase()]; },
        removeHeader(k: string) { delete this.headers[k.toLowerCase()]; },
        write(chunk: any) { writtenData = Buffer.concat([writtenData, Buffer.from(chunk)]); },
        end(chunk?: any) { if (chunk) this.write(chunk); this.writableEnded = true; },
        on() { return this; },
        once() { return this; },
        emit() { return false; },
        destroy() {}
      } as unknown as ServerResponse;

      const response = new AeroResponse(resMock);
      await response.streamFile(req, dummyFilePath);

      await new Promise(r => setTimeout(r, 50));

      expect(response.statusCode).toBe(206);
      expect((resMock as any).headers['content-range']).toBe(`bytes 0-9/${dummyContent.length}`);
      expect((resMock as any).headers['content-length']).toBe(10);
      expect(writtenData.toString()).toBe('0123456789');
    });

    it('returns 416 Range Not Satisfiable for out of bounds', async () => {
      const req = { headers: { range: 'bytes=100-200' } } as unknown as IncomingMessage;
      const resMock = {
        headersSent: false,
        writableEnded: false,
        statusCode: 200,
        headers: {} as Record<string, string>,
        setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
        getHeader(k: string) { return this.headers[k.toLowerCase()]; },
        removeHeader(k: string) { delete this.headers[k.toLowerCase()]; },
        end() { this.writableEnded = true; }
      } as unknown as ServerResponse;

      const response = new AeroResponse(resMock);
      await response.streamFile(req, dummyFilePath);

      expect(response.statusCode).toBe(416);
      expect((resMock as any).headers['content-range']).toBe(`bytes */${dummyContent.length}`);
    });
  });

  describe('Resumable Chunked Uploader', () => {
    it('initiates, chunks, validates checksums, and finalizes upload', async () => {
      const uploader = new ChunkedUploadManager(path.join(tempDir, 'chunks'));

      const fileData = 'CHUNK1CHUNK2CHUNK3';
      const chunk1 = Buffer.from('CHUNK1');
      const chunk2 = Buffer.from('CHUNK2');
      const chunk3 = Buffer.from('CHUNK3');

      const expectedFinalChecksum = crypto.createHash('sha256').update(fileData).digest('hex');
      const chunk2Checksum = crypto.createHash('sha256').update(chunk2).digest('hex');

      const uploadId = uploader.initiateUpload({
        fileName: 'test.txt',
        totalSize: 18,
        totalChunks: 3
      });

      expect(uploadId).toBeDefined();

      const status = uploader.getStatus(uploadId);
      expect(status?.totalChunks).toBe(3);
      expect(status?.uploadedChunks.length).toBe(0);

      await uploader.uploadChunk(uploadId, 0, chunk1);

      // Test individual chunk checksum validation
      await uploader.uploadChunk(uploadId, 1, chunk2, chunk2Checksum);

      // Should fail if checksum is wrong
      await expect(uploader.uploadChunk(uploadId, 2, chunk3, 'wronghash')).rejects.toThrow(/Checksum validation failed/);

      // Try again with no checksum validation for chunk 3
      await uploader.uploadChunk(uploadId, 2, chunk3);

      expect(uploader.getStatus(uploadId)?.uploadedChunks).toEqual([0, 1, 2]);

      const finalDest = path.join(tempDir, 'final.txt');

      // Finalize and validate combined checksum
      const destPath = await uploader.finalizeUpload(uploadId, finalDest, expectedFinalChecksum);

      expect(destPath).toBe(finalDest);
      const combinedData = await fs.promises.readFile(finalDest, 'utf8');
      expect(combinedData).toBe(fileData);

      // Status should be cleaned up
      expect(uploader.getStatus(uploadId)).toBeNull();
    });
  });
});
