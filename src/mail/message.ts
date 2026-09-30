/**
 * @file message.ts
 * @description Fluent MailMessage builder for AeroJS Mail system.
 */

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export class MailMessage {
  public toAddresses: string[] = [];
  public fromAddress = 'no-reply@aerojs.org';
  public fromName?: string;
  public ccAddresses: string[] = [];
  public bccAddresses: string[] = [];
  public subjectLine = '';
  public htmlBody = '';
  public textBody = '';
  public attachments: MailAttachment[] = [];

  public to(address: string | string[]): this {
    if (Array.isArray(address)) {
      this.toAddresses.push(...address);
    } else {
      this.toAddresses.push(address);
    }
    return this;
  }

  public from(address: string, name?: string): this {
    this.fromAddress = address;
    this.fromName = name;
    return this;
  }

  public cc(address: string | string[]): this {
    if (Array.isArray(address)) {
      this.ccAddresses.push(...address);
    } else {
      this.ccAddresses.push(address);
    }
    return this;
  }

  public bcc(address: string | string[]): this {
    if (Array.isArray(address)) {
      this.bccAddresses.push(...address);
    } else {
      this.bccAddresses.push(address);
    }
    return this;
  }

  public subject(subject: string): this {
    this.subjectLine = subject;
    return this;
  }

  public html(html: string): this {
    this.htmlBody = html;
    return this;
  }

  public text(text: string): this {
    this.textBody = text;
    return this;
  }

  public attach(filename: string, content: string | Buffer, contentType?: string): this {
    this.attachments.push({ filename, content, contentType });
    return this;
  }

  public toJSON(): Record<string, any> {
    return {
      to: this.toAddresses,
      from: this.fromAddress,
      fromName: this.fromName,
      cc: this.ccAddresses,
      bcc: this.bccAddresses,
      subject: this.subjectLine,
      html: this.htmlBody,
      text: this.textBody,
      attachmentsCount: this.attachments.length,
    };
  }
}
