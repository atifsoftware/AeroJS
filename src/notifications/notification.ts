/**
 * @file notification.ts
 * @description Base Notification class for AeroJS multi-channel dispatch.
 */

import { MailMessage } from '../mail/message.js';

export interface DatabaseNotificationRecord {
  id: string;
  type: string;
  notifiableType?: string;
  notifiableId?: string | number;
  data: Record<string, any>;
  readAt?: Date | null;
  createdAt: Date;
}

export interface BroadcastNotificationData {
  channel: string;
  event: string;
  data: Record<string, any>;
}

export interface SmsNotificationData {
  to: string;
  message: string;
}

export abstract class Notification {
  public id?: string;

  /**
   * Defines which channels this notification should be sent through.
   * E.g. ['mail', 'database', 'broadcast', 'sms']
   */
  public abstract via(notifiable: any): string[] | Promise<string[]>;

  /**
   * Builds the email representation of the notification.
   */
  public toMail?(notifiable: any): MailMessage | Promise<MailMessage>;

  /**
   * Builds the database representation of the notification.
   */
  public toDatabase?(notifiable: any): Record<string, any> | Promise<Record<string, any>>;

  /**
   * Builds the realtime broadcast payload.
   */
  public toBroadcast?(notifiable: any): BroadcastNotificationData | Promise<BroadcastNotificationData>;

  /**
   * Builds the SMS payload.
   */
  public toSms?(notifiable: any): SmsNotificationData | Promise<SmsNotificationData>;
}
