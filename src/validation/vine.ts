/**
 * @file vine.ts
 * @description First-Class VineJS Integration Layer for AeroJS.
 * Provides Bengali & English localized message providers, schema compilation,
 * and unified error formatting for @vinejs/vine.
 */

import { UnprocessableEntityError } from '../core/errors.js';

export const defaultBengaliVineMessages: Record<string, string> = {
  'required': '{{ field }} ঘরটি অবশ্যই পূরণ করতে হবে।',
  'email': '{{ field }} অবশ্যই একটি সঠিক ইমেইল এড্রেস হতে হবে।',
  'minLength': '{{ field }} কমপক্ষে {{ min }} অক্ষরের হতে হবে।',
  'maxLength': '{{ field }} {{ max }} অক্ষরের বেশি হতে পারবে না।',
  'string': '{{ field }} অবশ্যই একটি স্ট্রিং হতে হবে।',
  'number': '{{ field }} অবশ্যই সংখ্যা হতে হবে।',
  'boolean': '{{ field }} অবশ্যই true বা false হতে হবে।',
  'confirmed': '{{ field }} কনফার্মেশন মিলছে না।',
  'url': '{{ field }} ইউআরএল ফর্ম্যাটটি সঠিক নয়।',
  'date': '{{ field }} সঠিক তারিখ নয়।',
  'in': 'নির্বাচিত {{ field }}-টি সঠিক নয়।',
  'notIn': 'নির্বাচিত {{ field }}-টি গ্রহণযোগ্য নয়।',
};

export class VineHelper {
  private static _vineModule: any = null;

  /**
   * Lazily loads or registers @vinejs/vine
   */
  public static async getVine(): Promise<any> {
    if (this._vineModule) return this._vineModule;
    try {
      // @ts-ignore
      const mod: any = await import('@vinejs/vine');
      this._vineModule = mod.default || mod;
      return this._vineModule;
    } catch {
      return null;
    }
  }

  /**
   * Directly sets the vine instance (useful when user imports it in their app)
   */
  public static setVine(vineInstance: any): void {
    this._vineModule = vineInstance;
  }

  /**
   * Validates data against a VineJS schema or compiled validator.
   */
  public static async validate<T = any>(
    schemaOrValidator: any,
    data: unknown,
    customMessages: Record<string, string> = {}
  ): Promise<T> {
    try {
      let validator = schemaOrValidator;

      // If raw schema passed and not yet compiled, compile it
      if (typeof schemaOrValidator.validate !== 'function') {
        const vine = await this.getVine();
        if (!vine || typeof vine.compile !== 'function') {
          throw new Error(
            'VineJS (@vinejs/vine) is not installed. Please install it with `npm install @vinejs/vine` to use raw Vine schemas.'
          );
        }
        validator = vine.compile(schemaOrValidator);
      }

      // Check if custom messages provider can be applied
      let options: any;
      if (Object.keys(customMessages).length > 0) {
        try {
          // @ts-ignore
          const mod: any = await import('@vinejs/vine');
          const SimpleMessagesProvider = mod.SimpleMessagesProvider;
          if (SimpleMessagesProvider) {
            options = {
              messagesProvider: new SimpleMessagesProvider({
                ...defaultBengaliVineMessages,
                ...customMessages,
              }),
            };
          }
        } catch {
          // ignore if SimpleMessagesProvider is unavailable
        }
      }

      return await validator.validate(data, options);
    } catch (error: any) {
      if (error && error.messages && Array.isArray(error.messages)) {
        const formattedErrors: Record<string, string> = {};
        for (const msg of error.messages) {
          if (!formattedErrors[msg.field]) {
            formattedErrors[msg.field] = msg.message;
          }
        }
        const firstMsg = error.messages[0]?.message || 'Validation failed';
        throw new UnprocessableEntityError(firstMsg, formattedErrors);
      }
      throw error;
    }
  }
}
