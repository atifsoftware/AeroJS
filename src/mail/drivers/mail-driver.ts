/**
 * @file mail-driver.ts
 * @description MailDriver interface for email dispatch adapters in AeroJS.
 */

import type { MailMessage } from '../message.js';

export interface SentMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface MailDriver {
  send(message: MailMessage): Promise<SentMailResult>;
}
