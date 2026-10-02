import { describe, it, expect, beforeEach } from 'vitest';
import { Notification, Notifications, notify } from '../src/notifications/index.js';
import { Mail, MailMessage } from '../src/mail/index.js';

class LabTestReadyNotification extends Notification {
  constructor(public testName: string, public testId: number) {
    super();
  }

  public via(notifiable: any): string[] {
    return ['mail', 'database', 'broadcast'];
  }

  public toMail(notifiable: any): MailMessage {
    const msg = new MailMessage();
    msg.subject(`Lab Test Ready: ${this.testName}`)
       .text(`Hello ${notifiable.name}, your test results are ready.`);
    return msg;
  }

  public toDatabase(notifiable: any): Record<string, any> {
    return {
      testName: this.testName,
      testId: this.testId,
      message: 'Results uploaded by lab technician',
    };
  }

  public toBroadcast(notifiable: any) {
    return {
      channel: `patient.${notifiable.id}`,
      event: 'LabTestReady',
      data: { testId: this.testId },
    };
  }
}

describe('AeroJS Multi-Channel Notification System', () => {
  let user: { id: number; name: string; email: string };

  beforeEach(() => {
    Notifications.restore();
    Mail.restore();
    user = {
      id: 501,
      name: 'Rahim Ahmed',
      email: 'rahim@hospital.org',
    };
  });

  it('dispatches multi-channel notification via Mail, Database, and Broadcast', async () => {
    const memoryMail = Mail.fake();

    const notif = new LabTestReadyNotification('Blood Test (CBC)', 9021);
    await Notifications.send(user, notif);

    // Verify Mail was delivered
    expect(memoryMail.sentMessages.length).toBe(1);
    expect(memoryMail.sentMessages[0]?.subjectLine).toBe('Lab Test Ready: Blood Test (CBC)');
    expect(memoryMail.sentMessages[0]?.toAddresses).toContain('rahim@hospital.org');
  });

  it('supports custom channels via Notifications.extend()', async () => {
    let smsSent: { to: string; msg: string } | null = null;

    Notifications.extend('sms', (notifiable, notification: any) => {
      smsSent = {
        to: notifiable.phone,
        msg: `Alert: ${notification.testName}`,
      };
    });

    class SmsOnlyNotification extends Notification {
      constructor(public testName: string) {
        super();
      }
      public via() {
        return ['sms'];
      }
    }

    const patientWithPhone = { id: 7, phone: '+8801700000000' };
    await Notifications.send(patientWithPhone, new SmsOnlyNotification('X-Ray Complete'));

    expect(smsSent).toEqual({
      to: '+8801700000000',
      msg: 'Alert: X-Ray Complete',
    });
  });

  it('supports testing fakes and assertions via Notifications.fake()', async () => {
    Notifications.fake();

    const notif = new LabTestReadyNotification('MRI Scan', 400);
    await notify(user, notif);

    Notifications.assertSentTo(user, LabTestReadyNotification, (n) => n.testName === 'MRI Scan');

    const otherUser = { id: 999, name: 'Karim', email: 'karim@example.com' };
    Notifications.assertNotSentTo(otherUser, LabTestReadyNotification);
  });
});
