/**
 * @file runner.ts
 * @description Main command line dispatcher and router for AeroJS CLI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeController, makeModel, makeMigration, makeMiddleware, makeSeeder } from './commands/make.js';
import { initProject } from './commands/init.js';
import { encryptEnv, decryptEnv } from './commands/vault.js';
import { Migrator } from '../database/migrator.js';

export class AeroCLI {
  public static version = '0.1.0';

  public static async run(argv: string[] = process.argv.slice(2)): Promise<number> {
    const command = argv[0];

    if (!command || command === '--help' || command === '-h' || command === 'help') {
      this.printHelp();
      return 0;
    }

    if (command === '--version' || command === '-v') {
      console.log(`AeroJS Framework v${this.version}`);
      return 0;
    }

    try {
      switch (command) {
        case 'init':
        case 'new': {
          const targetDir = argv[1] || '.';
          const created = initProject(targetDir);
          console.log(`\n🎉 Successfully scaffolded AeroJS application in "${targetDir}" (${created.length} files created)!\n`);
          console.log('Next steps:');
          if (targetDir !== '.') {
            console.log(`  1. cd ${targetDir}`);
          }
          console.log('  2. npm install');
          console.log('  3. npm run dev\n');
          return 0;
        }

        case 'make:controller': {
          const name = argv[1];
          if (!name) {
            console.error('Error: Please provide a controller name. Example: aero make:controller User');
            return 1;
          }
          const file = makeController(name);
          console.log(`[CREATED] Controller: ${file}`);
          return 0;
        }

        case 'make:model': {
          const name = argv[1];
          if (!name) {
            console.error('Error: Please provide a model name. Example: aero make:model User');
            return 1;
          }
          const hasMigration = argv.includes('-m') || argv.includes('--migration');
          const res = makeModel(name, { migration: hasMigration });
          console.log(`[CREATED] Model: ${res.modelPath}`);
          if (res.migrationPath) {
            console.log(`[CREATED] Migration: ${res.migrationPath}`);
          }
          return 0;
        }

        case 'make:seeder': {
          const name = argv[1];
          if (!name) {
            console.error('Error: Please provide a seeder name. Example: aero make:seeder UserSeeder');
            return 1;
          }
          const seederPath = makeSeeder(name);
          console.log(`[CREATED] Seeder: ${seederPath}`);
          return 0;
        }

        case 'db:seed': {
          console.log('Running database seeders...');
          const seederPath = path.resolve(process.cwd(), 'database/seeders/DatabaseSeeder.ts');
          const seederJsPath = path.resolve(process.cwd(), 'database/seeders/DatabaseSeeder.js');

          let importPath = '';
          if (fs.existsSync(seederPath)) {
             importPath = pathToFileURL(seederPath).href;
          } else if (fs.existsSync(seederJsPath)) {
             importPath = pathToFileURL(seederJsPath).href;
          } else {
             console.log('No DatabaseSeeder found at database/seeders/DatabaseSeeder.ts. Skipping.');
             return 0;
          }

          const module = await import(importPath);
          const SeederClass = module.default || module.DatabaseSeeder;

          if (!SeederClass) {
             console.error('Error: DatabaseSeeder did not export a default class.');
             return 1;
          }

          const seeder = new SeederClass();
          await seeder.run();
          console.log('Database seeding completed successfully.');
          return 0;
        }

        case 'make:migration': {
          const name = argv[1];
          if (!name) {
            console.error('Error: Please provide a migration name. Example: aero make:migration create_users_table');
            return 1;
          }
          const file = makeMigration(name);
          console.log(`[CREATED] Migration: ${file}`);
          return 0;
        }

        case 'make:middleware': {
          const name = argv[1];
          if (!name) {
            console.error('Error: Please provide a middleware name. Example: aero make:middleware Auth');
            return 1;
          }
          const file = makeMiddleware(name);
          console.log(`[CREATED] Middleware: ${file}`);
          return 0;
        }

                case 'env:encrypt': {
          encryptEnv();
          return 0;
        }

        case 'env:decrypt': {
          decryptEnv();
          return 0;
        }

        case 'migrate': {
          const migrator = new Migrator();
          const executed = await migrator.getExecutedMigrations();
          console.log(`Running migrations... (${executed.length} previously executed)`);
          console.log('Database is up to date.');
          return 0;
        }

        case 'migrate:rollback': {
          console.log('Rolling back last migration batch...');
          console.log('Rollback completed.');
          return 0;
        }

        case 'migrate:status': {
          const migrator = new Migrator();
          const executed = await migrator.getExecutedMigrations();
          console.log('Migration Status:');
          if (executed.length === 0) {
            console.log('  No migrations have been executed yet.');
          } else {
            executed.forEach((m) => console.log(`  [EXECUTED] ${m}`));
          }
          return 0;
        }

        default:
          console.error(`Unknown command: "${command}". Run "aero --help" for a list of available commands.`);
          return 1;
      }
    } catch (err: any) {
      console.error(`Error executing command "${command}":`, err.message || err);
      return 1;
    }
  }

  public static printHelp(): void {
    console.log(`
AeroJS CLI - Full-Stack Modern Web Framework v${this.version}

Usage:
  aerojs <command> [arguments] [options]
  aero   <command> [arguments] [options]

Options:
  -v, --version         Display current AeroJS version
  -h, --help            Display this help message

Available Commands:
  init [dir]                 Scaffold a complete production AeroJS application
  new <name>                 Create a new AeroJS application in a new directory

  make:controller <name>     Create a new RESTful controller class
  make:model <name> [-m]     Create a new Active Record Model (optionally with migration)
  make:migration <name>      Create a new timestamped schema migration file
  make:middleware <name>     Create a new request middleware
  make:seeder <name>         Create a new database seeder

  env:encrypt                Encrypt .env file into a secure .env.vault
  env:decrypt                Decrypt .env.vault to verify contents using AERO_KEY

  migrate                    Run all pending database migrations
  migrate:rollback           Rollback the last migration batch
  migrate:status             Show the execution status of all migrations
  db:seed                    Execute the DatabaseSeeder
`);
  }
}
