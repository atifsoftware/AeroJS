/**
 * @file resp-parser.ts
 * @description Zero-dependency Redis Serialization Protocol (RESP) parser and serializer.
 * Supports RESP2 basic types: Simple Strings, Errors, Integers, Bulk Strings, Arrays.
 */

export class RESPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RESPError';
  }
}

export class RESP {
  /**
   * Serializes commands into a RESP array of bulk strings.
   */
  public static serialize(args: (string | number | Buffer)[]): Buffer {
    const parts: Buffer[] = [];
    parts.push(Buffer.from(`*${args.length}\r\n`));

    for (const arg of args) {
      const buffer = Buffer.isBuffer(arg)
        ? arg
        : Buffer.from(String(arg));
      parts.push(Buffer.from(`$${buffer.length}\r\n`));
      parts.push(buffer);
      parts.push(Buffer.from('\r\n'));
    }

    return Buffer.concat(parts);
  }

  /**
   * Parses RESP formatted buffer into JS values.
   */
  public static parse(buffer: Buffer): { value: any; offset: number } {
    let offset = 0;

    function readNext(): any {
      if (offset >= buffer.length) throw new Error('Incomplete chunk');

      const type = buffer[offset];
      offset++;

      if (type === 43) { // '+' Simple String
        return readLine().toString('utf8');
      } else if (type === 45) { // '-' Error
        return new RESPError(readLine().toString('utf8'));
      } else if (type === 58) { // ':' Integer
        return parseInt(readLine().toString('utf8'), 10);
      } else if (type === 36) { // '$' Bulk String
        const len = parseInt(readLine().toString('utf8'), 10);
        if (len === -1) return null;
        if (offset + len + 2 > buffer.length) throw new Error('Incomplete chunk');
        const strBuf = buffer.subarray(offset, offset + len);
        offset += len + 2; // skip \r\n
        return strBuf.toString('utf8');
      } else if (type === 42) { // '*' Array
        const len = parseInt(readLine().toString('utf8'), 10);
        if (len === -1) return null;
        const arr = [];
        for (let i = 0; i < len; i++) {
          arr.push(readNext());
        }
        return arr;
      } else {
        throw new Error(`Unknown RESP type byte: ${type}`);
      }
    }

    function readLine(): Buffer {
      const end = buffer.indexOf('\r\n', offset);
      if (end === -1) throw new Error('Incomplete chunk');
      const line = buffer.subarray(offset, end);
      offset = end + 2;
      return line;
    }

    const value = readNext();
    return { value, offset };
  }

  /**
   * Parses multiple RESP responses from a buffer stream.
   * Modifies the input buffer object by advancing it if partial or fully consumed.
   */
  public static parseStream(
    bufferObj: { buffer: Buffer },
    onResponse: (err: Error | null, reply: any) => void
  ) {
    while (bufferObj.buffer.length > 0) {
      let result;
      try {
        result = this.parse(bufferObj.buffer);
      } catch (err: any) {
        if (err.message === 'Incomplete chunk') {
          // Wait for more data
          break;
        } else {
          // Fatal protocol error
          throw err;
        }
      }

      if (result.value instanceof RESPError) {
        onResponse(result.value, null);
      } else {
        onResponse(null, result.value);
      }

      bufferObj.buffer = bufferObj.buffer.subarray(result.offset);
    }
  }
}
