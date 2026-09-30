import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Logger,
  requestLogger,
  RequestContext,
} from '../src/logging/index.js';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('AeroJS Logging & Request Context', () => {
  beforeEach(() => {
    Logger.enableConsoleLogging = false; // Silence console in tests
  });

  afterEach(() => {
    Logger.enableConsoleLogging = true;
  });

  it('logs across all RFC 5424 levels without error', () => {
    expect(() => {
      Logger.debug('Debug msg');
      Logger.info('Info msg');
      Logger.notice('Notice msg');
      Logger.warning('Warning msg');
      Logger.error('Error msg');
      Logger.critical('Critical msg');
      Logger.alert('Alert msg');
      Logger.emergency('Emergency msg');
    }).not.toThrow();
  });

  it('detects slow queries when execution time exceeds threshold', () => {
    const warningSpy = vi.spyOn(Logger, 'warning');
    const debugSpy = vi.spyOn(Logger, 'debug');

    // Normal fast query
    Logger.logQuery('SELECT * FROM users', [], 20);
    expect(debugSpy).toHaveBeenCalledWith('Database query executed', expect.any(Object));

    // Slow query > 100ms
    Logger.logQuery('SELECT * FROM large_table', [], 250);
    expect(warningSpy).toHaveBeenCalledWith(
      expect.stringContaining('Slow query detected (250ms)'),
      expect.any(Object)
    );
  });

  it('logs user activity and security events', () => {
    const infoSpy = vi.spyOn(Logger, 'info');
    const warningSpy = vi.spyOn(Logger, 'warning');

    Logger.logActivity('user.login', { userId: 42 });
    expect(infoSpy).toHaveBeenCalledWith(
      'User activity: user.login',
      expect.objectContaining({ action: 'user.login', userId: 42 })
    );

    Logger.logSecurity('failed_login_attempt', { ip: '1.2.3.4' });
    expect(warningSpy).toHaveBeenCalledWith(
      'Security event: failed_login_attempt',
      expect.objectContaining({ event: 'failed_login_attempt', severity: 'high' })
    );
  });

  it('maintains active RequestContext across async boundaries in requestLogger middleware', async () => {
    const app = new Aero();
    app.use(requestLogger());

    app.get('/context-check', (ctx) => {
      const store = RequestContext.getStore();
      expect(store?.ctx).toBe(ctx);
      ctx.send('context-ok');
    });

    const client = createTestClient(app);
    const res = await client.get('/context-check');
    expect(res.status).toBe(200);
    expect(res.text()).toBe('context-ok');
  });
});
