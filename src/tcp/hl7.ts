/**
 * @file hl7.ts
 * @description Zero-dependency HL7 v2.x Message Parser for AeroJS.
 */

export interface ParsedHL7 {
  messageType: string;
  controlId: string;
  sendingApp: string;
  segments: Map<string, string[]>;
  raw: string;
  getSegment(name: string): string[] | undefined;
}

export class HL7 {
  /**
   * Parses raw HL7 string into structured segments and metadata.
   */
  public static parse(rawMsg: string): ParsedHL7 {
    const clean = rawMsg.trim();
    const lines = clean.split(/[\r\n]+/).filter(Boolean);
    const segments = new Map<string, string[]>();

    for (const line of lines) {
      const parts = line.split('|');
      const segName = parts[0];
      if (segName) {
        segments.set(segName, parts.slice(1));
      }

    }

    const msh = segments.get('MSH') || [];
    // MSH structure:
    // parts[0]: MSH
    // parts[1]: ^~\& (field separator encoding)
    // parts[2]: Sending Application
    // parts[8]: Message Type (e.g. ORU^R01 or ACK)
    // parts[9]: Message Control ID
    const sendingApp = msh[1] || '';
    const messageType = msh[7] || '';
    const controlId = msh[8] || '';

    return {
      messageType,
      controlId,
      sendingApp,
      segments,
      raw: rawMsg,
      getSegment(name: string) {
        return segments.get(name);
      },
    };
  }
}
