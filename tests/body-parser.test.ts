import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import {
  parseBody,
  readRawBody,
  parseUrlEncoded,
} from '../src/core/body-parser.js';
import { BadRequestError, PayloadTooLargeError } from '../src/core/errors.js';

function createMockRequest(
  chunks: (Buffer | string)[],
  headers: Record<string, string> = {}
): IncomingMessage {
  const stream = Readable.from(chunks);
  (stream as any).headers = headers;
  return stream as unknown as IncomingMessage;
}

describe('Body Parser Edge Cases & Comprehensive Coverage', () => {
  describe('readRawBody', () => {
    it('reads raw buffer from chunks', async () => {
      const req = createMockRequest([Buffer.from('hello '), Buffer.from('world')]);
      const buf = await readRawBody(req);
      expect(buf.toString('utf-8')).toBe('hello world');
    });

    it('handles non-Buffer chunks (string chunks)', async () => {
      const req = createMockRequest(['string chunk 1 ', 'string chunk 2']);
      const buf = await readRawBody(req);
      expect(buf.toString('utf-8')).toBe('string chunk 1 string chunk 2');
    });

    it('throws PayloadTooLargeError if Content-Length exceeds limit', async () => {
      const req = createMockRequest([Buffer.from('data')], {
        'content-length': '2048',
      });
      await expect(readRawBody(req, 1024)).rejects.toThrow(PayloadTooLargeError);
    });

    it('throws PayloadTooLargeError if streamed data exceeds limit mid-stream', async () => {
      const req = createMockRequest([
        Buffer.alloc(600, 'a'),
        Buffer.alloc(600, 'b'),
      ]);
      await expect(readRawBody(req, 1000)).rejects.toThrow(PayloadTooLargeError);
    });
  });

  describe('parseUrlEncoded', () => {
    it('parses single values', () => {
      const res = parseUrlEncoded('foo=bar&baz=qux');
      expect(res).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('parses array of multiple values for the same key (duplicate & triplicate)', () => {
      const res = parseUrlEncoded('tag=red&tag=green&tag=blue');
      expect(res).toEqual({ tag: ['red', 'green', 'blue'] });
    });
  });

  describe('parseBody', () => {
    it('returns undefined if Content-Type header is missing', async () => {
      const req = createMockRequest([Buffer.from('hello')]);
      const body = await parseBody(req);
      expect(body).toBeUndefined();
    });

    it('returns undefined if mimeType is empty (e.g. "; charset=utf-8")', async () => {
      const req = createMockRequest([Buffer.from('hello')], {
        'content-type': '; charset=utf-8',
      });
      const body = await parseBody(req);
      expect(body).toBeUndefined();
    });

    it('returns undefined if body buffer is empty', async () => {
      const req = createMockRequest([], {
        'content-type': 'application/json',
      });
      const body = await parseBody(req);
      expect(body).toBeUndefined();
    });

    it('parses valid application/json payload', async () => {
      const req = createMockRequest([Buffer.from(JSON.stringify({ name: 'Aero' }))], {
        'content-type': 'application/json; charset=utf-8',
      });
      const body = await parseBody(req);
      expect(body).toEqual({ name: 'Aero' });
    });

    it('throws BadRequestError for malformed JSON payload (lines 93-96)', async () => {
      const req = createMockRequest([Buffer.from('{ malformed json ...')], {
        'content-type': 'application/json',
      });
      await expect(parseBody(req)).rejects.toThrow(BadRequestError);

      const req2 = createMockRequest([Buffer.from('{ "broken":')], {
        'content-type': 'application/json',
      });
      await expect(parseBody(req2)).rejects.toThrow(/Malformed JSON payload/);
    });

    it('parses application/x-www-form-urlencoded payload', async () => {
      const req = createMockRequest([Buffer.from('user=john&role=admin&role=dev')], {
        'content-type': 'application/x-www-form-urlencoded',
      });
      const body = await parseBody(req);
      expect(body).toEqual({ user: 'john', role: ['admin', 'dev'] });
    });

    it('parses text/* content types as string', async () => {
      const req = createMockRequest([Buffer.from('Hello plain text')], {
        'content-type': 'text/plain',
      });
      const body = await parseBody(req);
      expect(body).toBe('Hello plain text');
    });

    it('returns raw Buffer for binary / other content types (lines 107-108)', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      const req = createMockRequest([binaryData], {
        'content-type': 'application/octet-stream',
      });
      const body = await parseBody(req);
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(body).toEqual(binaryData);
    });
  });
});
