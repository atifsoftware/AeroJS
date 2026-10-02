import { describe, it, expect, beforeEach } from 'vitest';
import { Model, encrypted, Database, MemoryDatabaseAdapter } from '../src/index.js';
import { Encrypter, Crypt } from '../src/security/encryption.js';

describe('AES-256-GCM Encrypter & Crypt Facade', () => {
  it('encrypts and decrypts strings correctly', () => {
    const secret = 'user-ssn-123-45-6789';
    const encrypted = Crypt.encrypt(secret);
    expect(encrypted.startsWith('aero:enc:')).toBe(true);
    expect(encrypted).not.toContain(secret);

    const decrypted = Crypt.decrypt<string>(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('encrypts and decrypts complex objects and numbers', () => {
    const data = { cardNumber: '4111222233334444', cvv: 123, active: true };
    const encrypted = Crypt.encrypt(data);
    expect(Crypt.isEncrypted(encrypted)).toBe(true);

    const decrypted = Crypt.decrypt<typeof data>(encrypted);
    expect(decrypted).toEqual(data);
  });

  it('generates random 32-byte keys and accepts custom keys', () => {
    const customKey = Encrypter.generateKey();
    expect(customKey).toHaveLength(64); // 32 bytes in hex = 64 chars

    const enc = new Encrypter(customKey);
    const cipher = enc.encrypt('sensitive-token');
    expect(enc.decrypt(cipher)).toBe('sensitive-token');
  });

  it('throws on tampered or invalid payloads', () => {
    expect(() => Crypt.decrypt('not-an-encrypted-string')).toThrow();
    expect(() => Crypt.decrypt('aero:enc:invalid')).toThrow();
  });
});

describe('Model Field-Level Encryption (@encrypted & static encrypted)', () => {
  class AccountRecord extends Model {
    public static override table = 'accounts';
    public static override fillable = ['name', 'ssn', 'private_notes'];
    public static override encrypted = ['ssn', 'private_notes'];

    @encrypted()
    public ssn!: string;
  }

  beforeEach(() => {
    Database.setAdapter(new MemoryDatabaseAdapter());
  });

  it('stores fields encrypted in the database and transparently decrypts when loaded', async () => {
    const account = await AccountRecord.create({
      name: 'Rahim Khan',
      ssn: '019-99-8888',
      private_notes: 'High net-worth client, confidential portfolio',
    });

    expect(account.id).toBeDefined();
    expect(account.name).toBe('Rahim Khan');
    // In-memory model instance retains plaintext
    expect(account.ssn).toBe('019-99-8888');
    expect(account.private_notes).toBe('High net-worth client, confidential portfolio');

    // Inspect RAW database table row to verify encryption at rest
    const rawRows = await Database.table('accounts').get();
    expect(rawRows.length).toBe(1);
    const rawAccount = rawRows[0]!;

    expect(rawAccount.name).toBe('Rahim Khan');
    expect(rawAccount.ssn).toMatch(/^aero:enc:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(rawAccount.ssn).not.toContain('019-99-8888');
    expect(rawAccount.private_notes).toMatch(/^aero:enc:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(rawAccount.private_notes).not.toContain('confidential');

    // Fetching the model via QueryBuilder / Model.find decrypts automatically
    const loaded = await AccountRecord.find(account.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Rahim Khan');
    expect(loaded!.ssn).toBe('019-99-8888');
    expect(loaded!.private_notes).toBe('High net-worth client, confidential portfolio');

    // toJSON includes decrypted values
    const json = loaded!.toJSON();
    expect(json.ssn).toBe('019-99-8888');
    expect(json.private_notes).toBe('High net-worth client, confidential portfolio');
  });

  it('updates encrypted fields and keeps them encrypted in database', async () => {
    const account = await AccountRecord.create({
      name: 'Karim Ullah',
      ssn: '111-22-3333',
      private_notes: 'Initial account notes',
    });

    account.ssn = '999-88-7777';
    account.private_notes = 'Updated confidential notes';
    await account.save();

    const rawRows = await Database.table('accounts').where('id', account.id).get();
    const raw = rawRows[0]!;
    expect(raw.ssn).toMatch(/^aero:enc:/);
    expect(raw.ssn).not.toContain('999-88-7777');

    const fresh = await AccountRecord.findOrFail(account.id);
    expect(fresh.ssn).toBe('999-88-7777');
    expect(fresh.private_notes).toBe('Updated confidential notes');
  });
});
