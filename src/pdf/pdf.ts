/**
 * @file pdf.ts
 * @description Zero-Dependency PDF & ESC/POS Thermal Receipt Generator for AeroJS.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface PdfOptions {
  paper?: 'A4' | 'A5' | 'Letter';
  margin?: number;
  title?: string;
}

export interface PdfGenerateOptions {
  template?: string;
  html?: string;
  data?: Record<string, any>;
  paper?: 'A4' | 'A5' | 'Letter';
}

/**
 * Minimal zero-dependency PDF 1.4 document builder.
 */
function createMinimalPdf(contentLines: string[], title = 'Document'): Buffer {
  const sanitizedLines = contentLines
    .map((l) => l.replace(/[\r\n]+/g, ' ').replace(/[\\()]/g, '\\$&'))
    .slice(0, 50);

  let streamContent = 'BT\n/F1 12 Tf\n50 780 Td\n16 TL\n';
  for (const line of sanitizedLines) {
    streamContent += `(${line}) '\n`;
  }
  streamContent += 'ET\n';

  const streamLength = Buffer.byteLength(streamContent, 'utf-8');

  const objects: string[] = [
    // 1: Catalog
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    // 2: Pages
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    // 3: Page
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    // 4: Font
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    // 5: Contents
    `5 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf-8'));
    body += obj;
  }

  const xrefOffset = Buffer.byteLength(body, 'utf-8');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, '0');
    body += `${offsetStr} 00000 n \n`;
  }

  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, 'utf-8');
}

export class PDF {
  /**
   * Generates a PDF Buffer from HTML or text.
   */
  public static async fromHtml(html: string, options: PdfOptions = {}): Promise<Buffer> {
    // Strip simple HTML tags to get readable text lines
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '$1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return createMinimalPdf(lines, options.title);
  }

  /**
   * Generates a PDF by loading an HTML template or interpolating data.
   */
  public static async generate(options: PdfGenerateOptions): Promise<Buffer> {
    let html = options.html || '';

    if (options.template) {
      const templatePaths = [
        path.resolve(process.cwd(), 'views/pdf', `${options.template}.html`),
        path.resolve(process.cwd(), 'views', `${options.template}.html`),
        path.resolve(process.cwd(), options.template),
      ];

      for (const p of templatePaths) {
        if (fs.existsSync(p)) {
          html = fs.readFileSync(p, 'utf-8');
          break;
        }
      }

      if (!html) {
        html = `<h1>${options.template}</h1>`;
      }
    }

    if (options.data) {
      for (const [key, val] of Object.entries(options.data)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        html = html.replace(regex, String(val ?? ''));
      }
    }

    return this.fromHtml(html, { paper: options.paper });
  }
}

/**
 * Fluent ESC/POS Thermal Receipt Builder (Standard 80mm / 58mm).
 */
export class ThermalReceipt {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  public static build(): ThermalReceipt {
    return new ThermalReceipt();
  }

  /**
   * Initialize printer (ESC @)
   */
  public init(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  /**
   * Align left (ESC a 0)
   */
  public left(text?: string): this {
    this.buffer.push(0x1b, 0x61, 0x00);
    if (text) this.line(text);
    return this;
  }

  /**
   * Align center (ESC a 1)
   */
  public center(text?: string): this {
    this.buffer.push(0x1b, 0x61, 0x01);
    if (text) this.line(text);
    return this;
  }

  /**
   * Align right (ESC a 2)
   */
  public right(text?: string): this {
    this.buffer.push(0x1b, 0x61, 0x02);
    if (text) this.line(text);
    return this;
  }

  /**
   * Set bold mode on/off (ESC E n)
   */
  public bold(enable: boolean = true): this {
    this.buffer.push(0x1b, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  /**
   * Large Header text (Double height & width)
   */
  public header(text: string): this {
    this.center();
    this.buffer.push(0x1d, 0x21, 0x11); // Double size
    this.bold(true);
    this.line(text);
    this.buffer.push(0x1d, 0x21, 0x00); // Normal size
    this.bold(false);
    return this;
  }

  /**
   * Append text line with \n
   */
  public line(text: string = ''): this {
    const bytes = Buffer.from(text + '\n', 'utf-8');
    for (const b of bytes) this.buffer.push(b);
    return this;
  }

  /**
   * Print divider rule
   */
  public divider(char = '-', length = 48): this {
    return this.line(char.repeat(length));
  }

  /**
   * Print 2-column key/value row (e.g. "Total:       $150.00")
   */
  public row(left: string, right: string, width = 48): this {
    const spaces = Math.max(1, width - left.length - right.length);
    return this.line(left + ' '.repeat(spaces) + right);
  }

  /**
   * Print simple Code 128 / Code 39 Barcode
   */
  public barcode(data: string): this {
    this.center();
    // GS h 80 (Height 80)
    this.buffer.push(0x1d, 0x68, 80);
    // GS w 2 (Width)
    this.buffer.push(0x1d, 0x77, 2);
    // GS k 4 (Code 39)
    this.buffer.push(0x1d, 0x6b, 0x04);
    const bytes = Buffer.from(data + '\0', 'ascii');
    for (const b of bytes) this.buffer.push(b);
    return this;
  }

  /**
   * Print QR code
   */
  public qr(data: string): this {
    this.center();
    const len = data.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);

    // Function 180: Store QR code data in symbol storage area
    this.buffer.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    const bytes = Buffer.from(data, 'utf-8');
    for (const b of bytes) this.buffer.push(b);

    // Function 181: Print the symbol data
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  /**
   * Paper feed & cut (GS V 66 0)
   */
  public cut(): this {
    // Feed 3 lines
    this.buffer.push(0x1b, 0x64, 0x03);
    // Cut command
    this.buffer.push(0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  /**
   * Returns Uint8Array of ESC/POS bytes.
   */
  public toBuffer(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
