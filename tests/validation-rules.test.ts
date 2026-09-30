import { describe, it, expect, beforeEach } from 'vitest';
import {
  Aero,
  Validator,
  VineHelper,
  UnprocessableEntityError,
  DB,
} from '../src/index.js';
import { createTestClient } from '../src/testing/test-client.js';

describe('AeroJS Validation & VineJS Integration (Step 2)', () => {
  beforeEach(async () => {
    await DB.closeAll();
  });

  describe('Laravel / Lucid Style Validator (Rules-based)', () => {
    it('validates basic fields with default Bengali error messages', () => {
      const v = Validator.make(
        { email: 'not-an-email', age: 15 },
        {
          name: 'required|min:3',
          email: 'required|email',
          age: 'required|numeric|min:18',
        }
      );

      expect(v.fails()).toBe(true);
      expect(v.passes()).toBe(false);
      const errors = v.errors();

      expect(errors['name']).toBeDefined();
      expect(errors['name']![0]).toContain('ঘরটি অবশ্যই পূরণ করতে হবে');

      expect(errors['email']![0]).toContain('সঠিক ইমেইল এড্রেস');
      expect(errors['age']![0]).toContain('কমপক্ষে 18');
    });

    it('supports custom field labels and custom message overrides', () => {
      const v = Validator.make(
        { user_email: '' },
        { user_email: 'required' },
        { 'user_email.required': ':field ফাঁকা রাখা যাবে না।' },
        { user_email: 'ব্যবহারকারীর ইমেইল' }
      );

      expect(v.fails()).toBe(true);
      expect(v.first('user_email')).toBe('ব্যবহারকারীর ইমেইল ফাঁকা রাখা যাবে না।');
    });

    it('supports English error messages when locale is set to en', () => {
      const v = Validator.make(
        { email: 'bad' },
        { email: 'required|email', name: 'required' },
        {},
        {},
        'en'
      );

      expect(v.fails()).toBe(true);
      expect(v.first('name')).toBe('The name field is required.');
      expect(v.first('email')).toBe('The email must be a valid email address.');
    });

    it('validates confirmed, between, in, and boolean rules', () => {
      // 1. Password confirmation mismatch
      const vPass = Validator.make(
        { password: 'secret123', password_confirmation: 'wrong' },
        { password: 'required|min:6|confirmed' }
      );
      expect(vPass.fails()).toBe(true);
      expect(vPass.first('password')).toContain('কনফার্মেশন মিলছে না');

      // 2. Successful confirmation
      const vPassOk = Validator.make(
        { password: 'secret123', password_confirmation: 'secret123' },
        { password: 'required|min:6|confirmed' }
      );
      expect(vPassOk.passes()).toBe(true);

      // 3. Between rule
      const vBetween = Validator.make({ score: 105 }, { score: 'between:0,100' });
      expect(vBetween.fails()).toBe(true);

      // 4. In rule
      const vIn = Validator.make({ role: 'superhero' }, { role: 'in:admin,editor,user' });
      expect(vIn.fails()).toBe(true);
    });

    it('validates async unique and exists database rules', async () => {
      // Seed users table
      await DB.table('users').insert([
        { id: 1, email: 'existing@aero.org', role: 'admin' },
      ]);

      // 1. Unique fails for existing email
      const v1 = await Validator.makeAsync(
        { email: 'existing@aero.org' },
        { email: 'required|email|unique:users,email' }
      );
      expect(v1.fails()).toBe(true);
      expect(v1.first('email')).toContain('ইতিমধ্যে ব্যবহৃত হয়েছে');

      // 2. Unique passes for new email
      const v2 = await Validator.makeAsync(
        { email: 'brandnew@aero.org' },
        { email: 'required|email|unique:users,email' }
      );
      expect(v2.passes()).toBe(true);

      // 3. Exists rule
      const vExists = await Validator.makeAsync(
        { user_id: 999 },
        { user_id: 'required|exists:users,id' }
      );
      expect(vExists.fails()).toBe(true);
    });
  });

  describe('Aero Context Integration (ctx.validate)', () => {
    it('integrates into Aero request lifecycle and returns 422 on validation error', async () => {
      const app = new Aero();

      app.post('/api/users', async (ctx) => {
        const data = await ctx.validate({
          name: 'required|min:3',
          email: 'required|email',
        });
        ctx.status(201).json({ success: true, user: data });
      });

      const client = createTestClient(app);

      // 1. Invalid input returns 422 with structured errors
      const resBad = await client.post('/api/users', {
        headers: { 'content-type': 'application/json' },
        body: { name: 'Al', email: 'not-an-email' },
      });

      expect(resBad.status).toBe(422);
      const jsonBad = resBad.json();
      expect(jsonBad.error).toBeDefined();

      // 2. Valid input passes
      const resGood = await client.post('/api/users', {
        headers: { 'content-type': 'application/json' },
        body: { name: 'Alice Smith', email: 'alice@aero.org' },
      });

      expect(resGood.status).toBe(201);
      expect(resGood.json().user.name).toBe('Alice Smith');
    });
  });

  describe('VineJS Helper & Error Formatting', () => {
    it('formats mock VineJS validation errors accurately', async () => {
      // Mock Vine-like validator object
      const mockVineValidator = {
        validate: async () => {
          const err: any = new Error('Validation failed');
          err.messages = [
            { field: 'email', message: 'email অবশ্যই একটি সঠিক ইমেইল এড্রেস হতে হবে।' },
            { field: 'password', message: 'password কমপক্ষে 8 অক্ষরের হতে হবে।' },
          ];
          throw err;
        },
      };

      await expect(
        VineHelper.validate(mockVineValidator, { email: 'bad' })
      ).rejects.toThrow(UnprocessableEntityError);

      try {
        await VineHelper.validate(mockVineValidator, { email: 'bad' });
      } catch (err: any) {
        expect(err.status).toBe(422);
        expect(err.errors['email']).toContain('সঠিক ইমেইল এড্রেস');
        expect(err.errors['password']).toContain('কমপক্ষে 8 অক্ষরের');
      }
    });
  });
});
