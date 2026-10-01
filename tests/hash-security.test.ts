import { describe, it, expect } from 'vitest';
import { Hash, hash, hashVerify, QueryBuilder, MemoryDatabaseAdapter } from '../src/index.js';

describe('AeroJS Security Hardening Suite', () => {
  describe('Hash Module (Zero-Dependency scrypt Password Hashing)', () => {
    it('hashes passwords into secure crypt format', async () => {
      const password = 'SuperSecretHospitalPassword#2026';
      const hashed = await Hash.make(password);

      expect(hashed).toBeDefined();
      expect(typeof hashed).toBe('string');
      expect(hashed.startsWith('$scrypt$')).toBe(true);

      // Verify format: $scrypt$N=...,r=...,p=...$<salt>$<hash>
      const parts = hashed.split('$');
      expect(parts.length).toBe(5);
      expect(parts[1]).toBe('scrypt');
      expect(parts[2]).toContain('N=16384');
    });

    it('verifies correct passwords successfully', async () => {
      const password = 'DoctorEmergencyPin999';
      const hashed = await hash(password);

      const isValid = await hashVerify(hashed, password);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect passwords', async () => {
      const password = 'CorrectPassword123';
      const hashed = await Hash.make(password);

      const isInvalid = await Hash.verify(hashed, 'WrongPassword456');
      expect(isInvalid).toBe(false);
    });

    it('handles corrupted or invalid hash strings gracefully', async () => {
      expect(await Hash.verify('corrupted-hash', 'password')).toBe(false);
      expect(await Hash.verify('', 'password')).toBe(false);
      expect(await Hash.verify('$scrypt$invalid', 'password')).toBe(false);
    });

    it('detects when rehash is needed', async () => {
      const oldHash = await Hash.make('pass', { N: 1024 });
      expect(Hash.needsRehash(oldHash)).toBe(true);

      const standardHash = await Hash.make('pass', { N: 16384 });
      expect(Hash.needsRehash(standardHash)).toBe(false);
    });
  });

  describe('QueryBuilder SQL Injection Hardening', () => {
    const adapter = new MemoryDatabaseAdapter();

    it('allows valid alphanumeric and dotted column names in orderBy', () => {
      const qb = new QueryBuilder('users', adapter);
      expect(() => qb.orderBy('id', 'asc')).not.toThrow();
      expect(() => qb.orderBy('users.created_at', 'desc')).not.toThrow();
      expect(() => qb.orderBy('patient_code', 'ASC')).not.toThrow();
    });

    it('blocks SQL injection attempts in orderBy column identifiers', () => {
      const qb = new QueryBuilder('users', adapter);
      expect(() => qb.orderBy('id; DROP TABLE users;', 'asc')).toThrow(/Security Violation/);
      expect(() => qb.orderBy('id UNION SELECT * FROM passwords', 'desc')).toThrow(/Security Violation/);
      expect(() => qb.orderBy('name--', 'desc')).toThrow(/Security Violation/);
    });

    it('blocks invalid operators in having clause', () => {
      const qb = new QueryBuilder('users', adapter);
      expect(() => qb.having('total', '=', 100)).not.toThrow();
      expect(() => qb.having('total', '>=', 50)).not.toThrow();
      expect(() => qb.having('total', '; DROP TABLE users;', 50)).toThrow(/Security Violation/);
    });

    it('blocks invalid operators in join clauses', () => {
      const qb = new QueryBuilder('orders', adapter);
      expect(() => qb.join('users', 'orders.user_id', '=', 'users.id')).not.toThrow();
      expect(() => qb.join('users', 'orders.user_id', 'INJECTED_OP', 'users.id')).toThrow(/Security Violation/);
    });
  });
});
