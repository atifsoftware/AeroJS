import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as net from 'node:net';
import { Mail, MailMessage, SmtpMailDriver, SmtpError } from '../src/mail/index.js';

describe('SmtpMailDriver & Mail System', () => {
  let mockServer: net.Server;
  let serverPort: number;
  let receivedCommands: string[] = [];
  let receivedDataBody = '';

  beforeAll(async () => {
    mockServer = net.createServer((socket) => {
      // Send 220 greeting
      socket.write('220 smtp.aerojs.mock ESMTP AeroMock ready\r\n');

      let inData = false;
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (inData) {
            if (line === '.') {
              inData = false;
              socket.write('250 2.0.0 Ok: queued as MOCK_MSG_12345\r\n');
            } else {
              receivedDataBody += line + '\n';
            }
            continue;
          }

          receivedCommands.push(line);

          if (line.startsWith('EHLO') || line.startsWith('HELO')) {
            socket.write('250-smtp.aerojs.mock\r\n250-PIPELINING\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME\r\n');
          } else if (line === 'AUTH LOGIN') {
            socket.write('334 VXNlcm5hbWU6\r\n'); // Base64 for "Username:"
          } else if (line === Buffer.from('testuser').toString('base64')) {
            socket.write('334 UGFzc3dvcmQ6\r\n'); // Base64 for "Password:"
          } else if (line === Buffer.from('testpass').toString('base64')) {
            socket.write('235 2.7.0 Authentication successful\r\n');
          } else if (line.startsWith('MAIL FROM:')) {
            socket.write('250 2.1.0 Ok\r\n');
          } else if (line.startsWith('RCPT TO:')) {
            if (line.includes('invalid@rejected.com')) {
              socket.write('550 5.1.1 User unknown\r\n');
            } else {
              socket.write('250 2.1.5 Ok\r\n');
            }
          } else if (line === 'DATA') {
            inData = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (line === 'QUIT') {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          } else {
            socket.write('250 Ok\r\n');
          }
        }
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const address = mockServer.address() as net.AddressInfo;
        serverPort = address.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('builds MIME multipart message with text, HTML, and base64 attachments', () => {
    const driver = new SmtpMailDriver({ host: '127.0.0.1', port: serverPort });
    const msg = new MailMessage();
    msg.from('billing@example.org', 'Billing Team');
    msg.to(['user1@example.org', 'user2@example.org']);
    msg.cc('admin@example.org');
    msg.subject('Monthly Statement & Invoice');
    msg.text('Hello, please find your invoice attached.');
    msg.html('<h1>Hello</h1><p>Please find your <b>invoice</b> attached.</p>');
    msg.attach('invoice.pdf', Buffer.from('PDF_SAMPLE_DATA'), 'application/pdf');

    const mime = driver.buildMimeMessage(msg, '<test-123@localhost>');

    expect(mime).toContain('Subject: Monthly Statement & Invoice');
    expect(mime).toContain('From: "Billing Team" <billing@example.org>');
    expect(mime).toContain('To: user1@example.org, user2@example.org');
    expect(mime).toContain('Cc: admin@example.org');
    expect(mime).toContain('multipart/mixed');
    expect(mime).toContain('multipart/alternative');
    expect(mime).toContain('invoice.pdf');
    expect(mime).toContain(Buffer.from('PDF_SAMPLE_DATA').toString('base64'));
  });

  it('dispatches email through SMTP server with AUTH LOGIN and returns delivery result', async () => {
    receivedCommands = [];
    receivedDataBody = '';

    const driver = new SmtpMailDriver({
      host: '127.0.0.1',
      port: serverPort,
      auth: {
        user: 'testuser',
        pass: 'testpass',
      },
    });

    const msg = new MailMessage();
    msg.from('system@aerojs.dev');
    msg.to('recipient@example.com');
    msg.subject('AeroJS SMTP Verification');
    msg.text('Plain text message body.');
    msg.html('<p>Plain text message body.</p>');

    const result = await driver.send(msg);

    expect(result.messageId).toBeDefined();
    expect(result.accepted).toContain('recipient@example.com');
    expect(result.rejected.length).toBe(0);

    // Verify SMTP dialog commands received by server
    expect(receivedCommands).toContain('EHLO localhost');
    expect(receivedCommands).toContain('AUTH LOGIN');
    expect(receivedCommands).toContain(Buffer.from('testuser').toString('base64'));
    expect(receivedCommands).toContain(Buffer.from('testpass').toString('base64'));
    expect(receivedCommands).toContain('MAIL FROM:<system@aerojs.dev>');
    expect(receivedCommands).toContain('RCPT TO:<recipient@example.com>');
    expect(receivedCommands).toContain('DATA');
    expect(receivedCommands).toContain('QUIT');
    expect(receivedDataBody).toContain('AeroJS SMTP Verification');
  });

  it('handles partial rejected recipients cleanly', async () => {
    receivedCommands = [];
    const driver = new SmtpMailDriver({
      host: '127.0.0.1',
      port: serverPort,
    });

    const msg = new MailMessage();
    msg.from('admin@aerojs.dev');
    msg.to(['valid@example.com', 'invalid@rejected.com']);
    msg.subject('Partial check');
    msg.text('Hello');

    const result = await driver.send(msg);
    expect(result.accepted).toContain('valid@example.com');
    expect(result.rejected).toContain('invalid@rejected.com');
  });

  it('throws SmtpError if all recipients are rejected', async () => {
    const driver = new SmtpMailDriver({
      host: '127.0.0.1',
      port: serverPort,
    });

    const msg = new MailMessage();
    msg.from('admin@aerojs.dev');
    msg.to('invalid@rejected.com');
    msg.subject('All rejected');

    await expect(driver.send(msg)).rejects.toThrow(SmtpError);
  });

  it('configures SMTP in MailManager and dispatches via Mail.driver("smtp")', async () => {
    Mail.configure({
      default: 'smtp',
      mailers: {
        smtp: {
          driver: 'smtp',
          host: '127.0.0.1',
          port: serverPort,
        },
      },
    });

    const result = await Mail.send((msg) => {
      msg.to('manager-test@example.com');
      msg.subject('Sent via MailManager');
      msg.text('This is sent via Mail facade');
    });

    expect(result.accepted).toContain('manager-test@example.com');
  });
});
