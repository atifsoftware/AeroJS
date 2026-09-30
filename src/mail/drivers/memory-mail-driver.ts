/**
 * @file memory-mail-driver.ts
 * @description In-memory mail driver for AeroJS.
 * Records all dispatched messages in memory for unit testing, inspection, and assertions.
 */

import type { MailDriver, SentMailResult } from './mail-driver.js';
import type { MailMessage } from '../message.js';

export class MemoryMailDriver implements MailDriver {
  public sentMessages: MailMessage[] = [];

  public async send(message: MailMessage): Promise<SentMailResult> {
    this.sentMessages.push(message);
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 8)}@aerojs.org>`;
    return {
      messageId,
      accepted: [...message.toAddresses, ...message.ccAddresses, ...message.bccAddresses],
      rejected: [],
    };
  }

  public get last(): MailMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  public clear(): void {
    this.sentMessages = [];
  }
}
