/**
 * @file uploaded-file.ts
 * @description UploadedFile class representing an HTTP multipart uploaded file.
 * Provides validation (size, MIME, extension), saving to disk, and direct Storage integration.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { Storage } from './storage-manager.js';

export interface FileValidationRules {
  maxSize?: number; // In bytes
  mimes?: string[]; // E.g. ['image/jpeg', 'image/png']
  extensions?: string[]; // E.g. ['.jpg', '.png', '.pdf']
}

export class UploadedFile {
  public readonly fieldName: string;
  public readonly originalName: string;
  public readonly mimeType: string;
  public readonly size: number;
  public readonly buffer: Buffer;

  constructor(options: {
    fieldName: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
  }) {
    this.fieldName = options.fieldName;
    this.originalName = options.originalName;
    this.mimeType = options.mimeType;
    this.buffer = options.buffer;
    this.size = options.buffer.length;
  }

  public get extension(): string {
    const ext = extname(this.originalName).toLowerCase();
    return ext.startsWith('.') ? ext : `.${ext}`;
  }

  /**
   * Validates file size, MIME type, and file extension.
   */
  public validate(rules: FileValidationRules): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (rules.maxSize !== undefined && this.size > rules.maxSize) {
      errors.push(`File size ${this.size} bytes exceeds maximum allowed limit of ${rules.maxSize} bytes`);
    }

    if (rules.mimes && rules.mimes.length > 0) {
      const normalizedMimes = rules.mimes.map((m) => m.toLowerCase());
      if (!normalizedMimes.includes(this.mimeType.toLowerCase())) {
        errors.push(`Invalid file MIME type "${this.mimeType}". Allowed: ${rules.mimes.join(', ')}`);
      }
    }

    if (rules.extensions && rules.extensions.length > 0) {
      const normalizedExts = rules.extensions.map((e) =>
        e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
      );
      if (!normalizedExts.includes(this.extension.toLowerCase())) {
        errors.push(`Invalid file extension "${this.extension}". Allowed: ${rules.extensions.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Saves the file to a local destination filepath.
   */
  public async saveAs(destinationPath: string): Promise<string> {
    const dir = dirname(destinationPath);
    await mkdir(dir, { recursive: true });
    await writeFile(destinationPath, this.buffer);
    return destinationPath;
  }

  /**
   * Stores the file using Aero's Storage manager onto a designated disk.
   */
  public async store(directory = 'uploads', diskName?: string): Promise<string> {
    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 8);
    const sanitizedName = this.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalFilename = `${timestamp}_${randomHex}_${sanitizedName}`;
    const targetPath = directory ? join(directory, finalFilename).replace(/\\/g, '/') : finalFilename;

    const disk = Storage.disk(diskName);
    return await disk.put(targetPath, this.buffer);
  }
}
