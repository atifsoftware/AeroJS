/**
 * @file notification-manager.ts
 * @description Central Notification Dispatcher and Facade for AeroJS.
 * Dispatches notifications across multiple channels (mail, database, broadcast, sms, custom).
 */

import * as crypto from 'node:crypto';
import type { Notification, DatabaseNotificationRecord } from './notification.js';
import { Mail } from '../mail/mailer.js';
import { DB } from '../database/connection.js';

export type ChannelHandler = (notifiable: any, notification: Notification) => Promise<any> | any;

export interface SentNotificationRecord {
  notifiable: any;
  notification: Notification;
  channels: string[];
}

export class NotificationManager {
  private channels = new Map<string, ChannelHandler>();
  private isFaked = false;
  private sentRecords: SentNotificationRecord[] = [];

  constructor() {
    this.registerDefaultChannels();
  }

  private registerDefaultChannels(): void {
    // 1. Mail Channel
    this.channels.set('mail', async (notifiable, notification) => {
      if (typeof notification.toMail !== 'function') return;
      const mailMessage = await notification.toMail(notifiable);

      // If no explicit recipient on message, infer from notifiable
      if (mailMessage.toAddresses.length === 0) {
        const email = notifiable.email || notifiable.emailAddress;
        if (email) {
          mailMessage.to(email);
        }
      }

      return await Mail.send(mailMessage);
    });

    // 2. Database Channel
    this.channels.set('database', async (notifiable, notification) => {
      if (typeof notification.toDatabase !== 'function') return;
      const data = await notification.toDatabase(notifiable);
      const id = notification.id || crypto.randomUUID();

      const record: DatabaseNotificationRecord = {
        id,
        type: notification.constructor.name,
        notifiableType: notifiable.constructor?.name || 'User',
        notifiableId: notifiable.id,
        data,
        readAt: null,
        createdAt: new Date(),
      };

      try {
        await DB.table('notifications').insert(record);
      } catch {
        // Fallback if table doesn't exist yet in tests
      }
      return record;
    });

    // 3. Broadcast Channel
    this.channels.set('broadcast', async (notifiable, notification) => {
      if (typeof notification.toBroadcast !== 'function') return;
      const broadcastData = await notification.toBroadcast(notifiable);
      return broadcastData;
    });
  }

  public extend(channelName: string, handler: ChannelHandler): this {
    this.channels.set(channelName.toLowerCase(), handler);
    return this;
  }

  /**
   * Dispatches a notification to one or multiple notifiable recipients.
   */
  public async send(
    notifiables: any | any[],
    notification: Notification
  ): Promise<void> {
    const list = Array.isArray(notifiables) ? notifiables : [notifiables];

    for (const notifiable of list) {
      const channels = await notification.via(notifiable);

      if (this.isFaked) {
        this.sentRecords.push({ notifiable, notification, channels });
        continue;
      }

      for (const channel of channels) {
        const handler = this.channels.get(channel.toLowerCase());
        if (handler) {
          await handler(notifiable, notification);
        }
      }
    }
  }

  /**
   * Enables mock recording for testing assertions.
   */
  public fake(): void {
    this.isFaked = true;
    this.sentRecords = [];
  }

  public restore(): void {
    this.isFaked = false;
    this.sentRecords = [];
  }

  public getSent(): SentNotificationRecord[] {
    return this.sentRecords;
  }

  public assertSentTo(
    notifiable: any,
    notificationClass: any,
    callback?: (notification: any) => boolean
  ): void {
    const found = this.sentRecords.some((record) => {
      const matchesNotifiable = record.notifiable === notifiable || record.notifiable.id === notifiable.id;
      const matchesClass = record.notification instanceof notificationClass || record.notification.constructor.name === notificationClass.name;
      if (!matchesNotifiable || !matchesClass) return false;
      return callback ? callback(record.notification) : true;
    });

    if (!found) {
      throw new Error(`Expected notification ${notificationClass.name} was not sent to notifiable.`);
    }
  }

  public assertNotSentTo(notifiable: any, notificationClass: any): void {
    const found = this.sentRecords.some((record) => {
      const matchesNotifiable = record.notifiable === notifiable || record.notifiable.id === notifiable.id;
      const matchesClass = record.notification instanceof notificationClass || record.notification.constructor.name === notificationClass.name;
      return matchesNotifiable && matchesClass;
    });

    if (found) {
      throw new Error(`Unexpected notification ${notificationClass.name} was sent to notifiable.`);
    }
  }
}

export const Notifications = new NotificationManager();

/**
 * Mixin / Helper function to send notification from a user/patient model.
 * Example: notify(user, new InvoiceNotification(inv));
 */
export async function notify(notifiable: any, notification: Notification): Promise<void> {
  return await Notifications.send(notifiable, notification);
}
