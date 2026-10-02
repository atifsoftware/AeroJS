import { describe, it, expect } from 'vitest';
import { Aero } from '../src/core/application.js';
import { createTestClient } from '../src/testing/test-client.js';
import { PDF, ThermalReceipt } from '../src/pdf/index.js';
import { I18nManager, i18nPlugin } from '../src/i18n/index.js';
import { TypedEnv, EnvValidationError } from '../src/config/env-schema.js';
import { Env } from '../src/config/env.js';

describe('Production Utility Modules: SSE, PDF/Thermal, I18n, Env Schema', () => {
  describe('Server-Sent Events (SSE)', () => {
    it('initializes SSE stream with correct headers and sends events', async () => {
      const app = new Aero();

      app.get('/events', (ctx) => {
        const stream = ctx.sse({ heartbeatMs: 1000 });
        stream.send({ message: 'hello' });
        stream.sendEvent('notice', { alert: 'Code Blue' });
        stream.close();
      });

      const client = createTestClient(app);
      const res = await client.get('/events');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.headers['cache-control']).toContain('no-cache');
      const text = await res.text();
      expect(text).toContain('data: {"message":"hello"}');
      expect(text).toContain('event: notice');
      expect(text).toContain('data: {"alert":"Code Blue"}');
    });
  });

  describe('Zero-Dependency PDF & Thermal Receipt Generator', () => {
    it('generates valid %PDF-1.4 document buffer from HTML and template', async () => {
      const html = '<h1>Invoice #INV-2026</h1><p>Patient: Rahim Uddin</p><p>Total: ৳5,200</p>';
      const pdfBuffer = await PDF.fromHtml(html);

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      const pdfString = pdfBuffer.toString('utf-8');
      expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfString).toContain('trailer');
      expect(pdfString.trim().endsWith('%%EOF')).toBe(true);
      expect(pdfString).toContain('Invoice #INV-2026');
    });

    it('interpolates template data in PDF.generate', async () => {
      const pdfBuffer = await PDF.generate({
        html: '<h2>Report for {{ patient }}</h2><p>Diagnosis: {{ diagnosis }}</p>',
        data: { patient: 'Karim', diagnosis: 'Normal' },
      });

      const pdfString = pdfBuffer.toString('utf-8');
      expect(pdfString).toContain('Report for Karim');
      expect(pdfString).toContain('Diagnosis: Normal');
    });

    it('builds ESC/POS thermal receipt binary stream', () => {
      const receipt = ThermalReceipt.build()
        .header('AERO HOSPITAL')
        .center('OPD Token: 42')
        .divider()
        .left('Doctor: Dr. Sarah')
        .right('Room: 204')
        .divider('=')
        .row('Consultation Fee', '৳1,000')
        .barcode('UHID-99882')
        .qr('https://hospital.aerojs.dev/verify/42')
        .cut();

      const bytes = receipt.toBuffer();
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(50);

      // Check ESC @ init byte
      expect(bytes[0]).toBe(0x1b);
      expect(bytes[1]).toBe(0x40);

      // Check cut command GS V 66 0 at the end
      const len = bytes.length;
      expect(bytes[len - 4]).toBe(0x1d);
      expect(bytes[len - 3]).toBe(0x56);
      expect(bytes[len - 2]).toBe(0x42);
      expect(bytes[len - 1]).toBe(0x00);
    });

    it('supports ctx.pdf() and ctx.thermalReceipt() in routes', async () => {
      const app = new Aero();

      app.get('/download-pdf', async (ctx) => {
        const buffer = await PDF.fromHtml('<h1>Test PDF</h1>');
        ctx.pdf(buffer);
      });

      app.get('/print-receipt', (ctx) => {
        const receipt = ThermalReceipt.build().line('Test').cut();
        ctx.thermalReceipt(receipt.toBuffer());
      });

      const client = createTestClient(app);

      const pdfRes = await client.get('/download-pdf');
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toBe('application/pdf');

      const receiptRes = await client.get('/print-receipt');
      expect(receiptRes.status).toBe(200);
      expect(receiptRes.headers['content-type']).toBe('application/octet-stream');
    });
  });

  describe('I18n Localization Engine', () => {
    const translations = {
      en: {
        welcome: 'Welcome {name}!',
        queue: {
          call: 'Token {token}, please proceed to Room {room}.',
        },
        items_one: '{count} item',
        items_other: '{count} items',
      },
      bn: {
        welcome: 'স্বাগতম {name}!',
        queue: {
          call: 'টোকেন {token}, অনুগ্রহ করে রুম {room}-এ আসুন।',
        },
        items: {
          one: '{count}টি পণ্য',
          other: '{count}টি পণ্য',
        },
      },
    };

    it('translates nested keys and interpolates parameters', () => {
      const i18n = new I18nManager({
        locales: ['en', 'bn'],
        defaultLocale: 'en',
        translations,
      });

      expect(i18n.t('welcome', { name: 'Rahim' }, 'en')).toBe('Welcome Rahim!');
      expect(i18n.t('welcome', { name: 'রহিম' }, 'bn')).toBe('স্বাগতম রহিম!');
      expect(i18n.t('queue.call', { token: 15, room: 203 }, 'bn')).toBe(
        'টোকেন 15, অনুগ্রহ করে রুম 203-এ আসুন।'
      );
    });

    it('handles singular and plural localization', () => {
      const i18n = new I18nManager({
        locales: ['en', 'bn'],
        defaultLocale: 'en',
        translations,
      });

      expect(i18n.t('items', { count: 1 }, 'en')).toBe('1 item');
      expect(i18n.t('items', { count: 7 }, 'en')).toBe('7 items');
      expect(i18n.t('items', { count: 1 }, 'bn')).toBe('1টি পণ্য');
      expect(i18n.t('items', { count: 10 }, 'bn')).toBe('10টি পণ্য');
    });

    it('integrates into Aero app and auto-detects Accept-Language', async () => {
      const app = new Aero();
      app.useI18n({
        locales: ['en', 'bn'],
        defaultLocale: 'en',
        translations,
      });

      app.get('/greet', (ctx) => {
        ctx.status(200).json({
          locale: ctx.locale,
          message: ctx.t('welcome', { name: 'User' }),
        });
      });

      const client = createTestClient(app);

      // Default
      const resEn = await client.get('/greet');
      expect((await resEn.json()).message).toBe('Welcome User!');

      // Bengali via Accept-Language
      const resBn = await client.get('/greet', {
        headers: { 'accept-language': 'bn-BD,bn;q=0.9,en;q=0.8' },
      });
      expect((await resBn.json()).locale).toBe('bn');
      expect((await resBn.json()).message).toBe('স্বাগতম User!');

      // Override via query parameter ?lang=bn
      const resQuery = await client.get('/greet?lang=bn');
      expect((await resQuery.json()).locale).toBe('bn');
    });
  });

  describe('Typed Environment Schema Validation', () => {
    it('validates and coerces strongly-typed environment variables', () => {
      const mockEnv = {
        APP_NAME: 'AeroApp',
        PORT: '8080',
        DEBUG: 'true',
        ENVIRONMENT: 'production',
        API_URL: 'https://api.aerojs.dev',
        ADMIN_EMAIL: 'admin@aerojs.dev',
      };

      const config = TypedEnv.schema(
        {
          APP_NAME: TypedEnv.string().required().min(3),
          PORT: TypedEnv.number().default(3000),
          DEBUG: TypedEnv.boolean().default(false),
          ENVIRONMENT: TypedEnv.enum(['development', 'production', 'test']).required(),
          API_URL: TypedEnv.url().required(),
          ADMIN_EMAIL: TypedEnv.email().required(),
        },
        mockEnv
      );

      expect(config.APP_NAME).toBe('AeroApp');
      expect(config.PORT).toBe(8080);
      expect(config.DEBUG).toBe(true);
      expect(config.ENVIRONMENT).toBe('production');
      expect(config.API_URL).toBe('https://api.aerojs.dev');
      expect(config.ADMIN_EMAIL).toBe('admin@aerojs.dev');
    });

    it('throws EnvValidationError with detailed error list when validation fails', () => {
      const mockEnv = {
        PORT: 'not-a-number',
        ENVIRONMENT: 'staging',
        API_URL: 'invalid-url',
      };

      expect(() => {
        TypedEnv.schema(
          {
            DB_HOST: TypedEnv.string().required(),
            PORT: TypedEnv.number(),
            ENVIRONMENT: TypedEnv.enum(['development', 'production']),
            API_URL: TypedEnv.url(),
          },
          mockEnv
        );
      }).toThrowError(EnvValidationError);

      try {
        TypedEnv.schema(
          {
            DB_HOST: TypedEnv.string().required(),
            PORT: TypedEnv.number(),
            ENVIRONMENT: TypedEnv.enum(['development', 'production']),
          },
          mockEnv
        );
      } catch (err: any) {
        expect(err.errors.length).toBeGreaterThanOrEqual(3);
        expect(err.message).toContain("Environment variable 'DB_HOST' is required");
        expect(err.message).toContain("Environment variable 'PORT' must be a valid number");
        expect(err.message).toContain("must be one of [development, production]");
      }
    });

    it('works directly via Env.schema static helper', () => {
      const mockEnv = {
        SECRET_KEY: '1234567890123456',
      };

      const validated = Env.schema(
        {
          SECRET_KEY: Env.string().length(16).required(),
          OPTIONAL_FLAG: Env.boolean().default(true),
        },
        mockEnv
      );

      expect(validated.SECRET_KEY).toBe('1234567890123456');
      expect(validated.OPTIONAL_FLAG).toBe(true);
    });
  });
});
