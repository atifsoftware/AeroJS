import { Schema, type Migration } from 'aero';

export const migration: Migration = {
  async up(): Promise<void> {
    await Schema.createTable('aero_cache', (table) => {
      table.string('key', 255);
      table.columns.find(c => c.name === 'key')!.isPrimary = true;
      table.text('value');
      table.integer('expiration').nullable();
    });
  },

  async down(): Promise<void> {
    await Schema.dropTableIfExists('aero_cache');
  },
};

export default migration;
