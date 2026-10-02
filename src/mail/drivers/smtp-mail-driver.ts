/**
 * @file smtp-mail-driver.ts
 * @description Zero-dependency native SMTP email driver for AeroJS.
 * Supports Plain, TLS (port 465), STARTTLS (port 587/25), AUTH LOGIN,
 * multipart HTML/Plain text, and file attachments without external packages.
 */

import * as net from 'node:net';
import * as tls from 'node:tls';
import * as crypto from 'node:crypto';
import type { MailDriver, SentMailResult } from './mail-driver.js';
import type { MailMessage } from '../message.js';

export interface SmtpAuthOptions {
  user: string;
  pass: string;
}

export interface SmtpConfig {
  host?: string;
  port?: number;
  secure?: boolean; // true for 465 (SSL/TLS direct), false for 587/25 (STARTTLS)
  auth?: SmtpAuthOptions;
  timeout?: number;
  name?: string; // Client hostname for EHLO (default: 'localhost')
  tls?: tls.ConnectionOptions;
}

export class SmtpError extends Error {
  public code?: string | number;
  public response?: string;

  constructor(message: string, code?: string | number, response?: string) {
    super(message);
    this.name = 'SmtpError';
    this.code = code;
    this.response = response;
  }
}

export class SmtpMailDriver implements MailDriver {
  private config: Required<Pick<SmtpConfig, 'host' | 'port' | 'secure' | 'timeout' | 'name'>> & SmtpConfig;

  constructor(config: SmtpConfig = {}) {
    const port = config.port ?? (config.secure ? 465 : 587);
    this.config = {
      host: config.host || '127.0.0.1',
      port,
      secure: config.secure ?? (port === 465),
      timeout: config.timeout ?? 15000,
      name: config.name || 'localhost',
      auth: config.auth,
      tls: config.tls,
    };
  }

  public async send(message: MailMessage): Promise<SentMailResult> {
    const recipients = [
      ...message.toAddresses,
      ...message.ccAddresses,
      ...message.bccAddresses,
    ].filter(Boolean);

    if (recipients.length === 0) {
      throw new SmtpError('No recipients defined for email dispatch.');
    }

    const from = message.fromAddress || 'no-reply@aerojs.org';
    const messageId = `<${crypto.randomUUID()}@${this.config.name}>`;

    const socket = await this.connect();

    try {
      // 1. Read initial 220 banner
      let banner = await this.readResponse(socket);
      if (!banner.startsWith('220')) {
        throw new SmtpError(`Invalid SMTP greeting from ${this.config.host}: ${banner}`, banner.slice(0, 3), banner);
      }

      // 2. Send EHLO
      let ehloResponse = await this.sendCommand(socket, `EHLO ${this.config.name}`);
      if (!ehloResponse.startsWith('250')) {
        // Fallback to HELO if EHLO rejected
        ehloResponse = await this.sendCommand(socket, `HELO ${this.config.name}`);
        if (!ehloResponse.startsWith('250')) {
          throw new SmtpError(`EHLO/HELO rejected: ${ehloResponse}`, ehloResponse.slice(0, 3), ehloResponse);
        }
      }

      // 3. STARTTLS if required and available
      let activeSocket = socket;
      if (!this.config.secure && ehloResponse.includes('STARTTLS')) {
        const startTlsRes = await this.sendCommand(socket, 'STARTTLS');
        if (startTlsRes.startsWith('220')) {
          activeSocket = await this.upgradeToTls(socket);
          // Re-send EHLO after TLS handshake
          ehloResponse = await this.sendCommand(activeSocket, `EHLO ${this.config.name}`);
        }
      }

      // 4. Authenticate if credentials provided
      if (this.config.auth && this.config.auth.user) {
        await this.authenticate(activeSocket, this.config.auth);
      }

      // 5. MAIL FROM
      const mailFromRes = await this.sendCommand(activeSocket, `MAIL FROM:<${from}>`);
      if (!mailFromRes.startsWith('250')) {
        throw new SmtpError(`MAIL FROM rejected: ${mailFromRes}`, mailFromRes.slice(0, 3), mailFromRes);
      }

      // 6. RCPT TO
      const accepted: string[] = [];
      const rejected: string[] = [];

      for (const recipient of recipients) {
        const rcptRes = await this.sendCommand(activeSocket, `RCPT TO:<${recipient}>`);
        if (rcptRes.startsWith('250') || rcptRes.startsWith('251')) {
          accepted.push(recipient);
        } else {
          rejected.push(recipient);
        }
      }

      if (accepted.length === 0) {
        throw new SmtpError(`All recipients rejected by SMTP server: ${rejected.join(', ')}`);
      }

      // 7. DATA
      const dataRes = await this.sendCommand(activeSocket, 'DATA');
      if (!dataRes.startsWith('354')) {
        throw new SmtpError(`DATA command rejected: ${dataRes}`, dataRes.slice(0, 3), dataRes);
      }

      // 8. Build & Send MIME Payload
      const rawMime = this.buildMimeMessage(message, messageId);
      const finishDataRes = await this.sendCommand(activeSocket, `${rawMime}\r\n.`);
      if (!finishDataRes.startsWith('250')) {
        throw new SmtpError(`Message data rejected: ${finishDataRes}`, finishDataRes.slice(0, 3), finishDataRes);
      }

      // 9. QUIT
      try {
        await this.sendCommand(activeSocket, 'QUIT');
      } catch {
        // Ignored on close
      }

      return {
        messageId,
        accepted,
        rejected,
      };
    } finally {
      socket.destroy();
    }
  }

  private connect(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      let socket: net.Socket;
      const options = {
        host: this.config.host,
        port: this.config.port,
        timeout: this.config.timeout,
      };

      if (this.config.secure) {
        socket = tls.connect({
          ...options,
          ...this.config.tls,
          servername: this.config.host,
        });
      } else {
        socket = net.createConnection(options);
      }

      const onConnect = () => {
        socket.removeListener('error', onError);
        resolve(socket);
      };

      const onError = (err: Error) => {
        socket.destroy();
        reject(new SmtpError(`Failed to connect to SMTP server ${this.config.host}:${this.config.port} — ${err.message}`));
      };

      socket.once('connect', onConnect);
      socket.once('secureConnect', onConnect);
      socket.once('error', onError);
      socket.setTimeout(this.config.timeout, () => {
        socket.destroy();
        reject(new SmtpError(`Connection timeout to SMTP server ${this.config.host}:${this.config.port}`));
      });
    });
  }

  private upgradeToTls(socket: net.Socket): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const tlsSocket = tls.connect({
        socket,
        host: this.config.host,
        servername: this.config.host,
        ...this.config.tls,
      });

      tlsSocket.once('secureConnect', () => {
        resolve(tlsSocket);
      });

      tlsSocket.once('error', (err) => {
        reject(new SmtpError(`TLS upgrade failed: ${err.message}`));
      });
    });
  }

  private async authenticate(socket: net.Socket, auth: SmtpAuthOptions): Promise<void> {
    const authRes = await this.sendCommand(socket, 'AUTH LOGIN');
    if (!authRes.startsWith('334')) {
      throw new SmtpError(`AUTH LOGIN rejected: ${authRes}`, authRes.slice(0, 3), authRes);
    }

    const userB64 = Buffer.from(auth.user).toString('base64');
    const userRes = await this.sendCommand(socket, userB64);
    if (!userRes.startsWith('334')) {
      throw new SmtpError(`SMTP username rejected: ${userRes}`, userRes.slice(0, 3), userRes);
    }

    const passB64 = Buffer.from(auth.pass).toString('base64');
    const passRes = await this.sendCommand(socket, passB64);
    if (!passRes.startsWith('235')) {
      throw new SmtpError(`SMTP authentication failed: ${passRes}`, passRes.slice(0, 3), passRes);
    }
  }

  private sendCommand(socket: net.Socket, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      socket.write(`${command}\r\n`, (err) => {
        if (err) {
          return reject(new SmtpError(`Failed to write to SMTP socket: ${err.message}`));
        }
        this.readResponse(socket).then(resolve).catch(reject);
      });
    });
  }

  private readResponse(socket: net.Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        // Check if we have complete SMTP response line(s)
        const lines = buffer.trimEnd().split('\r\n');
        const lastLine = lines[lines.length - 1];

        // RFC 5321: multiline responses have '-' after code (e.g. 250-SIZE), final line has ' ' (e.g. 250 OK)
        if (lastLine && /^\d{3} /.test(lastLine)) {
          cleanup();
          resolve(buffer);
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(new SmtpError(`Error reading SMTP response: ${err.message}`));
      };

      const onClose = () => {
        cleanup();
        reject(new SmtpError('SMTP connection closed unexpectedly while reading response.'));
      };

      const cleanup = () => {
        socket.removeListener('data', onData);
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
      };

      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
    });
  }

  public buildMimeMessage(message: MailMessage, messageId: string): string {
    const boundaryMixed = `----=_Part_Mixed_${crypto.randomBytes(8).toString('hex')}`;
    const boundaryAlt = `----=_Part_Alt_${crypto.randomBytes(8).toString('hex')}`;

    const headers: string[] = [
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      `Subject: ${message.subjectLine || '(No Subject)'}`,
      `From: ${message.fromName ? `"${message.fromName}" <${message.fromAddress}>` : message.fromAddress}`,
      `To: ${message.toAddresses.join(', ')}`,
    ];

    if (message.ccAddresses.length > 0) {
      headers.push(`Cc: ${message.ccAddresses.join(', ')}`);
    }

    const hasAttachments = message.attachments.length > 0;
    const hasHtml = Boolean(message.htmlBody);
    const hasText = Boolean(message.textBody);

    if (hasAttachments) {
      headers.push(`MIME-Version: 1.0`);
      headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
    } else if (hasHtml && hasText) {
      headers.push(`MIME-Version: 1.0`);
      headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    } else if (hasHtml) {
      headers.push(`MIME-Version: 1.0`);
      headers.push(`Content-Type: text/html; charset=UTF-8`);
      headers.push(`Content-Transfer-Encoding: 7bit`);
    } else {
      headers.push(`MIME-Version: 1.0`);
      headers.push(`Content-Type: text/plain; charset=UTF-8`);
      headers.push(`Content-Transfer-Encoding: 7bit`);
    }

    const mimeParts: string[] = [headers.join('\r\n'), ''];

    if (hasAttachments) {
      mimeParts.push(`--${boundaryMixed}`);
      if (hasHtml && hasText) {
        mimeParts.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n`);
        mimeParts.push(`--${boundaryAlt}`);
        mimeParts.push(`Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n`);
        mimeParts.push(message.textBody);
        mimeParts.push(`--${boundaryAlt}`);
        mimeParts.push(`Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n`);
        mimeParts.push(message.htmlBody);
        mimeParts.push(`--${boundaryAlt}--`);
      } else if (hasHtml) {
        mimeParts.push(`Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n`);
        mimeParts.push(message.htmlBody);
      } else {
        mimeParts.push(`Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n`);
        mimeParts.push(message.textBody || '');
      }

      for (const attachment of message.attachments) {
        mimeParts.push(`--${boundaryMixed}`);
        const contentType = attachment.contentType || 'application/octet-stream';
        mimeParts.push(`Content-Type: ${contentType}; name="${attachment.filename}"`);
        mimeParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
        mimeParts.push(`Content-Transfer-Encoding: base64\r\n`);

        const buf = Buffer.isBuffer(attachment.content)
          ? attachment.content
          : Buffer.from(attachment.content, 'utf-8');
        mimeParts.push(buf.toString('base64'));
      }

      mimeParts.push(`--${boundaryMixed}--`);
    } else if (hasHtml && hasText) {
      mimeParts.push(`--${boundaryAlt}`);
      mimeParts.push(`Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n`);
      mimeParts.push(message.textBody);
      mimeParts.push(`--${boundaryAlt}`);
      mimeParts.push(`Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 7bit\r\n`);
      mimeParts.push(message.htmlBody);
      mimeParts.push(`--${boundaryAlt}--`);
    } else if (hasHtml) {
      mimeParts.push(message.htmlBody);
    } else {
      mimeParts.push(message.textBody || '');
    }

    return mimeParts.join('\r\n');
  }
}
