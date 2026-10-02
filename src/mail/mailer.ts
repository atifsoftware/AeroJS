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
import { SmtpMailDriver, type SmtpConfig } from './drivers/smtp-mail-driver.js';
import { Queue } from '../queue/queue-manager.js';
import { Job } from '../queue/job.js';

export interface MailerConnectionConfig {
  driver: 'memory' | 'log' | 'smtp' | string;
  smtp?: SmtpConfig;
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
  timeout?: number;
  name?: string;
}

export interface MailerConfig {
  default?: string;
  mailers?: Record<string, MailerConnectionConfig>;
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
  private mailerConfigs = new Map<string, MailerConnectionConfig>();
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
    if (config.mailers) {
      for (const [name, cfg] of Object.entries(config.mailers)) {
        this.mailerConfigs.set(name, cfg);
      }
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

    const cfg = this.mailerConfigs.get(mailerName);
    const driverType = cfg?.driver || mailerName;

    let instance: MailDriver;
    switch (driverType) {
      case 'smtp': {
        const smtpOptions: SmtpConfig = cfg?.smtp || {
          host: cfg?.host,
          port: cfg?.port,
          secure: cfg?.secure,
          auth: cfg?.auth,
          timeout: cfg?.timeout,
          name: cfg?.name,
        };
        instance = new SmtpMailDriver(smtpOptions);
        break;
      }
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
   * Helper to instantiate a standalone SmtpMailDriver.
   */
  public createSmtpDriver(config: SmtpConfig): SmtpMailDriver {
    return new SmtpMailDriver(config);
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
