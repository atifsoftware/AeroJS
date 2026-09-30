/**
 * @file mailer.ts
 * @description Central Mail manager and facade for AeroJS.
 * Provides fluent email dispatch, background queue integration (Mail.queue),
 * and test fakes for assertions.
 */

import { MailMessage } from './message.js';
import type { MailDriver, SentMailResult } from './drivers/mail-driver.js';
import { MemoryMailDriver } from './drivers/memory-mail-driver.js';
import { LogMailDriver } from './drivers/log-mail-driver.js';
import { Queue } from '../queue/queue-manager.js';
import { Job } from '../queue/job.js';

export interface MailerConfig {
  default?: string;
  mailers?: Record<string, { driver: 'memory' | 'log' | string }>;
}

export class SendEmailJob extends Job {
  public messageData: Record<string, any>;

  constructor(data: { messageData: Record<string, any> }) {
    super(data);
    this.messageData = data.messageData;
  }

  public async handle(): Promise<any> {
    const msg = new MailMessage();
    msg.to(this.messageData.to);
    msg.from(this.messageData.from, this.messageData.fromName);
    msg.subject(this.messageData.subject);
    msg.html(this.messageData.html);
    msg.text(this.messageData.text);
    return await Mail.send(msg);
  }
}

// Register job in Queue
Queue.registerJob('SendEmailJob', SendEmailJob);

export class MailManager {
  private defaultMailerName = 'memory';
  private mailers = new Map<string, MailDriver>();
  private isFaked = false;
  private memoryDriver = new MemoryMailDriver();

  constructor(config: MailerConfig = {}) {
    this.configure(config);
  }

  public configure(config: MailerConfig): this {
    if (config.default) {
      this.defaultMailerName = config.default;
    }
    return this;
  }

  public driver(name?: string): MailDriver {
    if (this.isFaked) {
      return this.memoryDriver;
    }

    const mailerName = name || this.defaultMailerName;
    if (this.mailers.has(mailerName)) {
      return this.mailers.get(mailerName)!;
    }

    let instance: MailDriver;
    switch (mailerName) {
      case 'log':
        instance = new LogMailDriver();
        break;
      case 'memory':
      default:
        instance = this.memoryDriver;
        break;
    }

    this.mailers.set(mailerName, instance);
    return instance;
  }

  /**
   * Sends an email immediately.
   */
  public async send(
    messageOrCallback: MailMessage | ((msg: MailMessage) => void)
  ): Promise<SentMailResult> {
    let msg: MailMessage;
    if (typeof messageOrCallback === 'function') {
      msg = new MailMessage();
      messageOrCallback(msg);
    } else {
      msg = messageOrCallback;
    }

    return await this.driver().send(msg);
  }

  /**
   * Pushes the email onto the background Queue for asynchronous delivery.
   */
  public async queue(
    messageOrCallback: MailMessage | ((msg: MailMessage) => void),
    queueName = 'emails'
  ): Promise<string | number> {
    let msg: MailMessage;
    if (typeof messageOrCallback === 'function') {
      msg = new MailMessage();
      messageOrCallback(msg);
    } else {
      msg = messageOrCallback;
    }

    Queue.registerJob('SendEmailJob', SendEmailJob);
    const job = new SendEmailJob({ messageData: msg.toJSON() });
    return await Queue.dispatch(job, { queue: queueName });
  }

  /**
   * Replaces transport with memory driver for testing assertions.
   */
  public fake(): MemoryMailDriver {
    this.isFaked = true;
    this.memoryDriver.clear();
    return this.memoryDriver;
  }

  public restore(): void {
    this.isFaked = false;
  }

  public get sent(): MailMessage[] {
    return this.memoryDriver.sentMessages;
  }
}

export const Mail = new MailManager();
