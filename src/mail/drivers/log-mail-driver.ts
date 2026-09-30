/**
 * @file log-mail-driver.ts
 * @description Log mail driver for AeroJS.
 * Logs email content to console/file via Aero RFC 5424 Logger without sending real emails.
 */

import type { MailDriver, SentMailResult } from './mail-driver.js';
import type { MailMessage } from '../message.js';
import { Logger } from '../../logging/logger.js';

export class LogMailDriver implements MailDriver {
  public async send(message: MailMessage): Promise<SentMailResult> {
    Logger.info(`[MAIL] Outgoing Email: "${message.subjectLine}"`, {
      to: message.toAddresses,
      from: message.fromAddress,
      subject: message.subjectLine,
      text: message.textBody,
    });

    const messageId = `<${Date.now()}.log@aerojs.org>`;
    return {
      messageId,
      accepted: [...message.toAddresses],
      rejected: [],
    };
  }
}
