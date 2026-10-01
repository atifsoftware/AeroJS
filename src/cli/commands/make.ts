/**
 * @file make.ts
 * @description Aero CLI scaffolding generators (controllers, models, migrations, middleware).
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path, { join, dirname } from 'node:path';

export function makeController(name: string, targetDir = 'app/controllers'): string {
  const cleanName = name.replace(/Controller$/i, '');
  const className = `${cleanName}Controller`;
  const filePath = join(process.cwd(), targetDir, `${className}.ts`);

  mkdirSync(dirname(filePath), { recursive: true });

  const content = `import type { AeroContext } from 'aero';

export class ${className} {
  /**
   * Display a listing of the resource.
   * GET /${cleanName.toLowerCase()}s
   */
  public async index(ctx: AeroContext): Promise<void> {
    ctx.status(200).json({ message: 'List of ${cleanName.toLowerCase()}s' });
  }

  /**
   * Display the specified resource.
   * GET /${cleanName.toLowerCase()}s/:id
   */
  public async show(ctx: AeroContext): Promise<void> {
    const { id } = ctx.params as any;
    ctx.status(200).json({ id });
  }

  /**
   * Store a newly created resource in storage.
   * POST /${cleanName.toLowerCase()}s
   */
  public async store(ctx: AeroContext): Promise<void> {
    const data = ctx.body;
    ctx.status(201).json({ created: true, data });
  }

  /**
   * Update the specified resource in storage.
   * PUT/PATCH /${cleanName.toLowerCase()}s/:id
   */
  public async update(ctx: AeroContext): Promise<void> {
    const { id } = ctx.params as any;
    const data = ctx.body;
    ctx.status(200).json({ updated: id, data });
  }

  /**
   * Remove the specified resource from storage.
   * DELETE /${cleanName.toLowerCase()}s/:id
   */
  public async destroy(ctx: AeroContext): Promise<void> {
    const { id } = ctx.params as any;
    ctx.status(200).json({ deleted: id });
  }
}

export default ${className};
`;

  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function makeModel(name: string, options: { migration?: boolean; targetDir?: string } = {}): { modelPath: string; migrationPath?: string } {
  const className = name.charAt(0).toUpperCase() + name.slice(1);
  const tableName = `${name.toLowerCase()}s`;
  const targetDir = options.targetDir || 'app/models';
  const filePath = join(process.cwd(), targetDir, `${className}.ts`);

  mkdirSync(dirname(filePath), { recursive: true });

  const content = `import { Model } from 'aero';

export class ${className} extends Model {
  public static override table = '${tableName}';
  public static override primaryKey = 'id';
  public static override hidden = [];
  public static override softDeletes = false;
}

export default ${className};
`;

  writeFileSync(filePath, content, 'utf-8');

  let migrationPath: string | undefined;
  if (options.migration) {
    migrationPath = makeMigration(`create_${tableName}_table`);
  }

  return { modelPath: filePath, migrationPath };
}

export function makeMigration(name: string, targetDir = 'database/migrations'): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').substring(0, 15);
  const fileName = `${timestamp}_${name.replace(/[^a-zA-Z0-9_]/g, '_')}.ts`;
  const filePath = join(process.cwd(), targetDir, fileName);

  mkdirSync(dirname(filePath), { recursive: true });

  const tableName = name.replace(/^create_/i, '').replace(/_table$/i, '') || 'items';

  const content = `import { Schema, type Migration } from 'aero';

export const migration: Migration = {
  async up(): Promise<void> {
    await Schema.createTable('${tableName}', (table) => {
      table.increments('id');
      table.string('name', 255);
      table.timestamps();
    });
  },

  async down(): Promise<void> {
    await Schema.dropTableIfExists('${tableName}');
  },
};

export default migration;
`;

  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function makeSeeder(name: string, targetDir = 'database/seeders'): string {
  const className = name.endsWith('Seeder') ? name : `${name}Seeder`;
  const cleanName = className.replace('Seeder', '');
  const fileName = `${className}.ts`;
  const dirPath = path.resolve(process.cwd(), targetDir);
  const filePath = path.join(dirPath, fileName);

  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

  const template = `import { Seeder } from 'aerojs';

export class ${className} extends Seeder {
  public async run(): Promise<void> {
    // Write your database queries or Model Factory creations here
    // Example: await UserFactory.createMany(10);
  }
}

export default ${className};
`;

  writeFileSync(filePath, template, 'utf8');
  return filePath;
}

export function makeMiddleware(name: string, targetDir = 'app/middleware'): string {
  const cleanName = name.replace(/Middleware$/i, '');
  const fileName = `${cleanName}.ts`;
  const filePath = join(process.cwd(), targetDir, fileName);

  mkdirSync(dirname(filePath), { recursive: true });

  const content = `import type { Middleware } from 'aero';

export const ${cleanName.toLowerCase()}Middleware: Middleware = async (ctx, next) => {
  // Logic executed before handling route
  await next();
  // Logic executed after handling route
};

export default ${cleanName.toLowerCase()}Middleware;
`;

  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
