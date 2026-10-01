
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as net from 'node:net';
import { RESP, RESPError } from '../src/redis/resp-parser.js';
import { RedisClient } from '../src/redis/redis-client.js';

describe('Redis Subsystem (Zero-Dependency)', () => {
  describe('RESP Parser', () => {
    it('serializes strings to bulk strings', () => {
      const buf = RESP.serialize(['SET', 'key', 'value']);
      expect(buf.toString()).toBe('*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n');
    });

    it('parses simple strings', () => {
      const { value, offset } = RESP.parse(Buffer.from('+OK\r\n'));
      expect(value).toBe('OK');
      expect(offset).toBe(5);
    });

    it('parses integers', () => {
      const { value } = RESP.parse(Buffer.from(':1000\r\n'));
      expect(value).toBe(1000);
    });

    it('parses bulk strings', () => {
      const { value } = RESP.parse(Buffer.from('$6\r\nfoobar\r\n'));
      expect(value).toBe('foobar');
    });

    it('parses arrays', () => {
      const { value } = RESP.parse(Buffer.from('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n'));
      expect(value).toEqual(['foo', 'bar']);
    });

    it('returns RESPError for error responses', () => {
      const { value } = RESP.parse(Buffer.from('-ERR unknown command\r\n'));
      expect(value).toBeInstanceOf(RESPError);
      expect(value.message).toBe('ERR unknown command');
    });
  });

  describe('TCP Connection & Client', () => {
    let server: net.Server;
    let client: RedisClient;
    const PORT = 6380;

    beforeAll(async () => {
      await new Promise<void>((resolve) => {
        server = net.createServer((socket) => {
          socket.on('data', (data) => {
            const str = data.toString();
            if (str.includes('MGET')) {
              socket.write(Buffer.from('*2\r\n$4\r\nval1\r\n$4\r\nval2\r\n'));
            } else if (str.includes('GET')) {
              socket.write(Buffer.from('$5\r\nvalue\r\n'));
            } else if (str.includes('SET')) {
              socket.write(Buffer.from('+OK\r\n'));
            } else if (str.includes('AUTH')) {
              socket.write(Buffer.from('+OK\r\n'));
            } else if (str.includes('PING')) {
              socket.write(Buffer.from('+PONG\r\n'));
            }
          });
        });
        server.listen(PORT, '127.0.0.1', () => {
          resolve();
        });
      });
    });

    afterAll(async () => {
      if (client) client.disconnect();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('connects to the server', async () => {
      client = new RedisClient({ port: PORT, host: '127.0.0.1' });
      await client.connect();
      expect(client.getRawConnection()['isConnected']).toBe(true);
    });

    it('sends commands and parses responses', async () => {
      const res = await client.set('key', 'value');
      expect(res).toBe('OK');

      const val = await client.get('key');
      expect(val).toBe('value');
    });

    it.skip('handles offline queue and reconnects', async () => {
      await client.disconnect();
      expect(client.getRawConnection()['isConnected']).toBe(false);

      const p = client.get('key'); // will queue and trigger connect
      // Wait a tiny bit for the connection to establish
      await new Promise(r => setTimeout(r, 100));
      expect(client.getRawConnection()['isConnected']).toBe(true);
      const res = await p;
      expect(res).toBe('value');
    });

    it.skip('handles MGET arrays', async () => {
      const vals = await client.mget('k1', 'k2');
      expect(vals).toEqual(['val1', 'val2']);
    });
  });
});
