/**
 * @file mllp.ts
 * @description Minimal Lower Layer Protocol (MLLP) framing helper for framed socket interfaces.
 */

export class MLLP {
  public static readonly START_BLOCK = 0x0b;       // <VT> Vertical Tab
  public static readonly END_BLOCK = 0x1c;         // <FS> File Separator
  public static readonly CARRIAGE_RETURN = 0x0d;   // <CR> Carriage Return

  /**
   * Wraps an HL7 message in standard MLLP framing (<VT> ... <FS><CR>).
   */
  public static wrap(message: string | Buffer): Buffer {
    const msgBuffer = typeof message === 'string' ? Buffer.from(message, 'utf-8') : message;
    const buf = Buffer.alloc(1 + msgBuffer.length + 2);
    buf[0] = MLLP.START_BLOCK;
    msgBuffer.copy(buf, 1);
    buf[buf.length - 2] = MLLP.END_BLOCK;
    buf[buf.length - 1] = MLLP.CARRIAGE_RETURN;
    return buf;
  }

  /**
   * Unwraps an MLLP buffer into an HL7 message string.
   */
  public static unwrap(buffer: Buffer): string {
    let start = 0;
    if (buffer[0] === MLLP.START_BLOCK) {
      start = 1;
    }
    let end = buffer.length;
    if (buffer[buffer.length - 1] === MLLP.CARRIAGE_RETURN && buffer[buffer.length - 2] === MLLP.END_BLOCK) {
      end = buffer.length - 2;
    }
    return buffer.subarray(start, end).toString('utf-8');
  }

  /**
   * Generates a standard HL7 ACK message wrapped in MLLP.
   */
  public static ack(controlId: string = '1', ackCode = 'AA'): Buffer {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const ackMsg = `MSH|^~\\&|AERO_GATEWAY|AERO_APP|CLIENT|RECEIVER|${timestamp}||ACK|${controlId}|P|2.3.1\rMSA|${ackCode}|${controlId}\r`;
    return MLLP.wrap(ackMsg);
  }
}
