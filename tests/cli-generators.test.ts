import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AeroCLI } from '../src/cli/runner.js';

describe('AeroJS CLI Extended Scaffolding', () => {
  const createdFiles: string[] = [];

  afterAll(() => {
    // Cleanup generated files
    for (const file of createdFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  });

  it('scaffolds background jobs via "make:job"', async () => {
    const code = await AeroCLI.run(['make:job', 'SendInvoice']);
    expect(code).toBe(0);

    const jobPath = path.resolve(process.cwd(), 'app/jobs/SendInvoiceJob.ts');
    createdFiles.push(jobPath);
    expect(fs.existsSync(jobPath)).toBe(true);

    const content = fs.readFileSync(jobPath, 'utf-8');
    expect(content).toContain('class SendInvoiceJob extends Job');
    expect(content).toContain('async handle()');
  });

  it('scaffolds email classes via "make:mail"', async () => {
    const code = await AeroCLI.run(['make:mail', 'OrderShipped']);
    expect(code).toBe(0);

    const mailPath = path.resolve(process.cwd(), 'app/mail/OrderShippedMail.ts');
    createdFiles.push(mailPath);
    expect(fs.existsSync(mailPath)).toBe(true);

    const content = fs.readFileSync(mailPath, 'utf-8');
    expect(content).toContain('class OrderShippedMail');
    expect(content).toContain('build(msg: MailMessage)');
  });

  it('scaffolds access policies via "make:policy"', async () => {
    const code = await AeroCLI.run(['make:policy', 'Post']);
    expect(code).toBe(0);

    const policyPath = path.resolve(process.cwd(), 'app/policies/PostPolicy.ts');
    createdFiles.push(policyPath);
    expect(fs.existsSync(policyPath)).toBe(true);

    const content = fs.readFileSync(policyPath, 'utf-8');
    expect(content).toContain('class PostPolicy');
    expect(content).toContain('create(user: any)');
  });

  it('scaffolds domain events via "make:event"', async () => {
    const code = await AeroCLI.run(['make:event', 'UserRegistered']);
    expect(code).toBe(0);

    const eventPath = path.resolve(process.cwd(), 'app/events/UserRegisteredEvent.ts');
    createdFiles.push(eventPath);
    expect(fs.existsSync(eventPath)).toBe(true);

    const content = fs.readFileSync(eventPath, 'utf-8');
    expect(content).toContain('class UserRegisteredEvent extends DomainEvent');
  });

  it('scaffolds event listeners via "make:listener"', async () => {
    const code = await AeroCLI.run(['make:listener', 'SendWelcomeNotification']);
    expect(code).toBe(0);

    const listenerPath = path.resolve(process.cwd(), 'app/listeners/SendWelcomeNotificationListener.ts');
    createdFiles.push(listenerPath);
    expect(fs.existsSync(listenerPath)).toBe(true);

    const content = fs.readFileSync(listenerPath, 'utf-8');
    expect(content).toContain('class SendWelcomeNotificationListener');
    expect(content).toContain('async handle(event: any)');
  });
});
