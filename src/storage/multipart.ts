/**
 * @file multipart.ts
 * @description Zero-dependency, stream/buffer RFC 7578 multipart/form-data parser for AeroJS.
 * Extracts form fields and UploadedFile instances without external native dependencies.
 */

import { UploadedFile } from './uploaded-file.js';

export interface MultipartParseResult {
  fields: Record<string, string | string[]>;
  files: Record<string, UploadedFile[]>;
}

export function parseMultipartBuffer(
  buffer: Buffer,
  boundary: string
): MultipartParseResult {
  const fields: Record<string, string | string[]> = {};
  const files: Record<string, UploadedFile[]> = {};

  const delimiter = Buffer.from(`--${boundary}`);
  const crlf = Buffer.from('\r\n');
  const headerSeparator = Buffer.from('\r\n\r\n');

  let startIndex = buffer.indexOf(delimiter);
  if (startIndex === -1) {
    return { fields, files };
  }

  while (startIndex !== -1) {
    const nextIndex = buffer.indexOf(delimiter, startIndex + delimiter.length);
    if (nextIndex === -1) break;

    // Slice content between boundaries
    let partBuffer = buffer.subarray(startIndex + delimiter.length, nextIndex);

    // Strip leading CRLF if present
    if (partBuffer.subarray(0, 2).equals(crlf)) {
      partBuffer = partBuffer.subarray(2);
    }
    // Strip trailing CRLF if present
    if (partBuffer.length >= 2 && partBuffer.subarray(partBuffer.length - 2).equals(crlf)) {
      partBuffer = partBuffer.subarray(0, partBuffer.length - 2);
    }

    if (partBuffer.length > 0) {
      const headerEndIndex = partBuffer.indexOf(headerSeparator);
      if (headerEndIndex !== -1) {
        const headerText = partBuffer.subarray(0, headerEndIndex).toString('utf-8');
        const bodyBuffer = partBuffer.subarray(headerEndIndex + headerSeparator.length);

        const dispositionMatch = headerText.match(/Content-Disposition:\s*form-data;\s*([^;\r\n]+(?:;\s*[^;\r\n]+)*)/i);
        if (dispositionMatch) {
          const dispositionParams = dispositionMatch[1]!;
          const nameMatch = dispositionParams.match(/name="([^"]+)"/i);
          const filenameMatch = dispositionParams.match(/filename="([^"]+)"/i);

          const fieldName = nameMatch ? nameMatch[1]! : 'unnamed';

          if (filenameMatch) {
            // It's a file
            const filename = filenameMatch[1]!;
            const contentTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
            const mimeType = contentTypeMatch ? contentTypeMatch[1]!.trim() : 'application/octet-stream';

            const uploadedFile = new UploadedFile({
              fieldName,
              originalName: filename,
              mimeType,
              buffer: bodyBuffer,
            });

            if (!files[fieldName]) {
              files[fieldName] = [];
            }
            files[fieldName]!.push(uploadedFile);
          } else {
            // It's a regular text field
            const fieldValue = bodyBuffer.toString('utf-8');
            const existing = fields[fieldName];
            if (existing === undefined) {
              fields[fieldName] = fieldValue;
            } else if (Array.isArray(existing)) {
              existing.push(fieldValue);
            } else {
              fields[fieldName] = [existing, fieldValue];
            }
          }
        }
      }
    }

    startIndex = nextIndex;
  }

  return { fields, files };
}
