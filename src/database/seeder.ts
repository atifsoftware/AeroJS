/**
 * @file seeder.ts
 * @description Provides the Database Seeder base class and execution runner.
 */

/**
 * Base abstract class for all database seeders.
 */
export abstract class Seeder {
  /**
   * Run the database seeds.
   */
  abstract run(): Promise<void>;
}

/**
 * The master DatabaseSeeder which invokes registered seeders.
 */
export class DatabaseSeeder extends Seeder {
  /**
   * Execute an array of seeders sequentially.
   */
  public async call(seeders: Array<new () => Seeder>): Promise<void> {
    for (const SeederClass of seeders) {
      const seeder = new SeederClass();
      await seeder.run();
    }
  }

  public async run(): Promise<void> {
    // Should be overridden by user to call specific seeders
  }
}
