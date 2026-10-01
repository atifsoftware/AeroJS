/**
 * @file chunked-uploader.ts
 * @description Resumable Chunked File Upload Manager.
 * Supports initiating, uploading chunks, validating SHA-256 checksums, and assembling final files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

export interface ChunkUploadInitOptions {
  fileName: string;
  totalSize: number;
  totalChunks: number;
  tempDir?: string;
  checksum?: string; // Optional checksum of the entire file
}

export interface ChunkUploadStatus {
  uploadId: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  expiresAt: number;
}

export class ChunkedUploadManager {
  private tempDir: string;
  private uploads = new Map<string, ChunkUploadStatus>();
  private readonly DEFAULT_TTL = 1000 * 60 * 60 * 24; // 24 hours

  constructor(tempDir = './storage/temp') {
    this.tempDir = tempDir;
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  /**
   * Initiates a new chunked upload session.
   */
  public initiateUpload(options: ChunkUploadInitOptions): string {
    const uploadId = crypto.randomUUID();
    const status: ChunkUploadStatus = {
      uploadId,
      fileName: options.fileName,
      totalSize: options.totalSize,
      totalChunks: options.totalChunks,
      uploadedChunks: [],
      expiresAt: Date.now() + this.DEFAULT_TTL
    };

    this.uploads.set(uploadId, status);

    // Create dedicated temp directory for this upload
    const uploadDir = path.join(this.tempDir, uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });

    return uploadId;
  }

  /**
   * Uploads a specific chunk.
   * Optionally validates the MD5 or SHA-256 checksum of the chunk.
   */
  public async uploadChunk(
    uploadId: string,
    chunkIndex: number,
    buffer: Buffer,
    expectedChecksum?: string,
    algorithm = 'sha256'
  ): Promise<boolean> {
    const status = this.uploads.get(uploadId);
    if (!status) {
      throw new Error(`Upload session ${uploadId} not found or expired.`);
    }

    if (chunkIndex < 0 || chunkIndex >= status.totalChunks) {
      throw new Error(`Invalid chunk index ${chunkIndex}. Total chunks: ${status.totalChunks}`);
    }

    if (expectedChecksum) {
      const hash = crypto.createHash(algorithm).update(buffer).digest('hex');
      if (hash !== expectedChecksum) {
        throw new Error(`Checksum validation failed for chunk ${chunkIndex}. Expected ${expectedChecksum}, got ${hash}`);
      }
    }

    const chunkPath = path.join(this.tempDir, uploadId, `${chunkIndex}.part`);
    await fs.promises.writeFile(chunkPath, buffer);

    if (!status.uploadedChunks.includes(chunkIndex)) {
      status.uploadedChunks.push(chunkIndex);
      status.uploadedChunks.sort((a, b) => a - b);
    }

    return true;
  }

  /**
   * Retrieves the current status of an upload session.
   */
  public getStatus(uploadId: string): ChunkUploadStatus | null {
    return this.uploads.get(uploadId) || null;
  }

  /**
   * Finalizes the upload, combining all chunks into the final destination file.
   */
  public async finalizeUpload(
    uploadId: string,
    destinationPath: string,
    expectedFinalChecksum?: string,
    algorithm = 'sha256'
  ): Promise<string> {
    const status = this.uploads.get(uploadId);
    if (!status) {
      throw new Error(`Upload session ${uploadId} not found or expired.`);
    }

    if (status.uploadedChunks.length !== status.totalChunks) {
      throw new Error(`Cannot finalize. Missing chunks. Received ${status.uploadedChunks.length} of ${status.totalChunks}`);
    }

    // Ensure destination directory exists
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });

    const writeStream = fs.createWriteStream(destinationPath);
    const hash = expectedFinalChecksum ? crypto.createHash(algorithm) : null;

    for (let i = 0; i < status.totalChunks; i++) {
      const chunkPath = path.join(this.tempDir, uploadId, `${i}.part`);
      const chunkBuffer = await fs.promises.readFile(chunkPath);

      writeStream.write(chunkBuffer);
      if (hash) {
        hash.update(chunkBuffer);
      }
    }

    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(undefined));
      writeStream.on('error', reject);
    });

    if (hash) {
      const finalHash = hash.digest('hex');
      if (finalHash !== expectedFinalChecksum) {
        // Cleanup failed assembled file
        await fs.promises.unlink(destinationPath).catch(() => {});
        throw new Error(`Final checksum validation failed. Expected ${expectedFinalChecksum}, got ${finalHash}`);
      }
    }

    // Clean up temporary chunks
    await this.abortUpload(uploadId);

    return destinationPath;
  }

  /**
   * Aborts an upload and cleans up temporary chunk files.
   */
  public async abortUpload(uploadId: string): Promise<void> {
    this.uploads.delete(uploadId);
    const uploadDir = path.join(this.tempDir, uploadId);
    try {
      await fs.promises.rm(uploadDir, { recursive: true, force: true });
    } catch {
      // Ignore if dir already removed
    }
  }

  /**
   * Cleans up expired upload sessions.
   * Can be run periodically via a cron job or scheduler.
   */
  public async cleanupExpiredUploads(): Promise<void> {
    const now = Date.now();
    for (const [uploadId, status] of this.uploads.entries()) {
      if (now > status.expiresAt) {
        await this.abortUpload(uploadId);
      }
    }
  }
}
