import { describe, it, expect, beforeEach } from 'vitest';
import {
  Queue,
  Job,
  Mail,
  MailMessage,
  DB,
  DatabaseQueueDriver,
} from '../src/index.js';

class WelcomeEmailJob extends Job {
  public static executedCount = 0;
  public userEmail: string;

  constructor(data: { userEmail: string }) {
    super(data);
    this.userEmail = data.userEmail;
  }

  public async handle(): Promise<void> {
    WelcomeEmailJob.executedCount++;
  }
}

class FlakyJob extends Job {
  public static failCount = 0;
  public static failedHookCalled = false;

  constructor() {
    super();
    this.tries = 2;
    this.delay = 0;
  }

  public async handle(): Promise<void> {
    FlakyJob.failCount++;
    throw new Error('Third-party API timeout');
  }

  public override async failed(err: Error): Promise<void> {
    FlakyJob.failedHookCalled = true;
  }
}

describe('AeroJS Background Queue & Mail System (Step 5)', () => {
  beforeEach(async () => {
    Queue.reset();
    Mail.restore();
    WelcomeEmailJob.executedCount = 0;
    FlakyJob.failCount = 0;
    FlakyJob.failedHookCalled = false;
    await DB.closeAll();
  });

  describe('Queue System & Worker', () => {
    it('dispatches and executes background jobs via QueueWorker', async () => {
      Queue.registerJob('WelcomeEmailJob', WelcomeEmailJob);

      // Dispatch 2 jobs
      await Queue.dispatch(new WelcomeEmailJob({ userEmail: 'alice@aero.org' }));
      await Queue.dispatch(new WelcomeEmailJob({ userEmail: 'bob@aero.org' }));

      expect(await Queue.driver().size()).toBe(2);

      const worker = Queue.createWorker({ maxTries: 3 });

      // Run worker once -> processes 1st job
      const didRun1 = await worker.runNext();
      expect(didRun1).toBe(true);
      expect(WelcomeEmailJob.executedCount).toBe(1);
      expect(await Queue.driver().size()).toBe(1);

      // Run worker again -> processes 2nd job
      const didRun2 = await worker.runNext();
      expect(didRun2).toBe(true);
      expect(WelcomeEmailJob.executedCount).toBe(2);
      expect(await Queue.driver().size()).toBe(0);

      // Queue is now empty
      const didRun3 = await worker.runNext();
      expect(didRun3).toBe(false);
    });

    it('retries failing jobs up to maxTries and triggers failed() hook', async () => {
      Queue.registerJob('FlakyJob', FlakyJob);

      await Queue.dispatch(new FlakyJob());
      const worker = Queue.createWorker({ maxTries: 2, backoffSeconds: 0 });

      // 1st attempt: fails, released back with backoff
      await worker.runNext();
      expect(FlakyJob.failCount).toBe(1);
      expect(FlakyJob.failedHookCalled).toBe(false);

      // 2nd attempt: fails again, maxTries (2) reached -> triggers failed() and moves to Dead Letter Queue
      await worker.runNext();
      expect(FlakyJob.failCount).toBe(2);
      expect(FlakyJob.failedHookCalled).toBe(true);
      expect(await Queue.driver().size()).toBe(0);
      expect(worker.getFailedJobs()).toHaveLength(1);
      expect(worker.getFailedJobs()[0]?.jobName).toBe('FlakyJob');
      expect(worker.getFailedJobs()[0]?.exception).toContain('Third-party API timeout');
    });

    it('supports database queue driver with Aero DB persistence', async () => {
      const dbDriver = new DatabaseQueueDriver({ table: 'aero_jobs' });

      const jobId = await dbDriver.push(JSON.stringify({ task: 'generate-invoice' }));
      expect(jobId).toBeDefined();
      expect(await dbDriver.size()).toBe(1);

      const popped = await dbDriver.pop();
      expect(popped).not.toBeNull();
      expect(popped?.attempts).toBe(1);
      expect(popped?.payload).toContain('generate-invoice');

      await dbDriver.delete(popped!.id);
      expect(await dbDriver.size()).toBe(0);
    });
  });

  describe('Mail System', () => {
    it('dispatches emails using fluent MailMessage builder and captures with Mail.fake()', async () => {
      const fake = Mail.fake();

      await Mail.send((msg) => {
        msg.to('founder@startup.io')
          .from('team@aerojs.org', 'Aero Core Team')
          .subject('Welcome to AeroJS Full-Stack Framework!')
          .html('<h1>Build faster.</h1>')
          .text('Build faster.');
      });

      expect(fake.sentMessages).toHaveLength(1);
      const sent = fake.last!;
      expect(sent.toAddresses).toContain('founder@startup.io');
      expect(sent.fromName).toBe('Aero Core Team');
      expect(sent.subjectLine).toBe('Welcome to AeroJS Full-Stack Framework!');
      expect(sent.htmlBody).toBe('<h1>Build faster.</h1>');
    });

    it('queues email onto background queue and processes via worker', async () => {
      const fake = Mail.fake();

      const msg = new MailMessage()
        .to('subscriber@weekly.dev')
        .subject('Weekly Newsletter')
        .text('Top 10 features in AeroJS');

      await Mail.queue(msg, 'emails');

      expect(await Queue.driver().size('emails')).toBe(1);

      const worker = Queue.createWorker({ queue: 'emails' });
      const processed = await worker.runNext();

      expect(processed).toBe(true);
      expect(fake.sentMessages).toHaveLength(1);
      expect(fake.last?.subjectLine).toBe('Weekly Newsletter');
      expect(await Queue.driver().size('emails')).toBe(0);
    });
  });
});
