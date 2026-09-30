/**
 * @file body-parser.ts
 * @description Stream-based HTTP request body parsers with size limit enforcement.
 */

import type { IncomingMessage } from 'node:http';
import { BadRequestError, PayloadTooLargeError } from './errors.js';

export interface BodyParserOptions {
  limit?: number;
}

const DEFAULT_BODY_LIMIT = 1024 * 1024; // 1MB

export async function readRawBody(
  req: IncomingMessage,
  limit: number = DEFAULT_BODY_LIMIT
): Promise<Buffer> {
  const contentLengthHeader = req.headers['content-length'];
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(contentLength) && contentLength > limit) {
      throw new PayloadTooLargeError(
        `Payload size of ${contentLength} bytes exceeds limit of ${limit} bytes`
      );
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;

    if (totalBytes > limit) {
      throw new PayloadTooLargeError(
        `Payload size exceeded limit of ${limit} bytes`
      );
    }

    chunks.push(bufferChunk);
  }

  return Buffer.concat(chunks);
}

export function parseUrlEncoded(text: string): Record<string, string | string[]> {
  const params = new URLSearchParams(text);
  const result: Record<string, string | string[]> = {};

  for (const [key, value] of params.entries()) {
    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return result;
}

export async function parseBody(
  req: IncomingMessage,
  options: BodyParserOptions = {}
): Promise<unknown> {
  const contentType = req.headers['content-type'];
  if (!contentType) {
    return undefined;
  }

  const limit = options.limit ?? DEFAULT_BODY_LIMIT;
  const mimeType = contentType.split(';')[0]?.trim().toLowerCase();

  if (!mimeType) {
    return undefined;
  }

  const rawBuffer = await readRawBody(req, limit);
  if (rawBuffer.length === 0) {
    return undefined;
  }

  const textContent = rawBuffer.toString('utf-8');

  if (mimeType === 'application/json') {
    try {
      return JSON.parse(textContent);
    } catch (err) {
      throw new BadRequestError(
        `Malformed JSON payload: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (mimeType === 'application/x-www-form-urlencoded') {
    return parseUrlEncoded(textContent);
  }

  if (mimeType === 'multipart/form-data') {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    const boundary = boundaryMatch ? boundaryMatch[1] || boundaryMatch[2] : null;
    if (boundary) {
      const { parseMultipartBuffer } = await import('../storage/multipart.js');
      const { fields, files } = parseMultipartBuffer(rawBuffer, boundary);
      (req as any).files = files;
      return fields;
    }
  }

  if (mimeType.startsWith('text/')) {
    return textContent;
  }

  return rawBuffer;
}
