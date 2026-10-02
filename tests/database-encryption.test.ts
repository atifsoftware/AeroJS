import { describe, it, expect, beforeEach } from 'vitest';
import { Model, encrypted, Database, MemoryDatabaseAdapter } from '../src/index.js';
import { Encrypter, Crypt } from '../src/security/encryption.js';

describe('AES-256-GCM Encrypter & Crypt Facade', () => {
  it('encrypts and decrypts strings correctly', () => {
    const secret = 'patient-ssn-123-45-6789';
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
  class PatientRecord extends Model {
    public static override table = 'patients';
    public static override fillable = ['name', 'ssn', 'medical_history'];
    public static override encrypted = ['ssn', 'medical_history'];

    @encrypted()
    public ssn!: string;
  }

  beforeEach(() => {
    Database.setAdapter(new MemoryDatabaseAdapter());
  });

  it('stores fields encrypted in the database and transparently decrypts when loaded', async () => {
    const patient = await PatientRecord.create({
      name: 'Rahim Khan',
      ssn: '019-99-8888',
      medical_history: 'Diabetes Type 2, Hypertension',
    });

    expect(patient.id).toBeDefined();
    expect(patient.name).toBe('Rahim Khan');
    // In-memory model instance retains plaintext
    expect(patient.ssn).toBe('019-99-8888');
    expect(patient.medical_history).toBe('Diabetes Type 2, Hypertension');

    // Inspect RAW database table row to verify encryption at rest
    const rawRows = await Database.table('patients').get();
    expect(rawRows.length).toBe(1);
    const rawPatient = rawRows[0]!;

    expect(rawPatient.name).toBe('Rahim Khan');
    expect(rawPatient.ssn).toMatch(/^aero:enc:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(rawPatient.ssn).not.toContain('019-99-8888');
    expect(rawPatient.medical_history).toMatch(/^aero:enc:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(rawPatient.medical_history).not.toContain('Diabetes');

    // Fetching the model via QueryBuilder / Model.find decrypts automatically
    const loaded = await PatientRecord.find(patient.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Rahim Khan');
    expect(loaded!.ssn).toBe('019-99-8888');
    expect(loaded!.medical_history).toBe('Diabetes Type 2, Hypertension');

    // toJSON includes decrypted values
    const json = loaded!.toJSON();
    expect(json.ssn).toBe('019-99-8888');
    expect(json.medical_history).toBe('Diabetes Type 2, Hypertension');
  });

  it('updates encrypted fields and keeps them encrypted in database', async () => {
    const patient = await PatientRecord.create({
      name: 'Karim Ullah',
      ssn: '111-22-3333',
      medical_history: 'Asthma',
    });

    patient.ssn = '999-88-7777';
    patient.medical_history = 'Asthma resolved';
    await patient.save();

    const rawRows = await Database.table('patients').where('id', patient.id).get();
    const raw = rawRows[0]!;
    expect(raw.ssn).toMatch(/^aero:enc:/);
    expect(raw.ssn).not.toContain('999-88-7777');

    const fresh = await PatientRecord.findOrFail(patient.id);
    expect(fresh.ssn).toBe('999-88-7777');
    expect(fresh.medical_history).toBe('Asthma resolved');
  });
});
