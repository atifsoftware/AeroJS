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

  const content = `import type { AeroContext } from 'aerojs';

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

  const content = `import { Model } from 'aerojs';

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

  const content = `import { Schema, type Migration } from 'aerojs';

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

  const content = `import type { Middleware } from 'aerojs';

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

export function makeJob(name: string, targetDir = 'app/jobs'): string {
  const cleanName = name.replace(/Job$/i, '');
  const className = `${cleanName}Job`;
  const fileName = `${className}.ts`;
  const filePath = join(process.cwd(), targetDir, fileName);

  mkdirSync(dirname(filePath), { recursive: true });

  const content = `import { Job } from 'aerojs';

export class ${className} extends Job {
  public static override queue = 'default';
  public static override maxTries = 3;

  constructor(data: Record<string, any> = {}) {
    super(data);
  }

  public async handle(): Promise<void> {
    // Background task business logic
    console.log('Processing ${className}:', this.data);
  }

  public async failed(error: Error): Promise<void> {
    console.error('${className} failed permanently:', error.message);
  }
}

export default ${className};
`;

  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function makeMail(name: string, targetDir = 'app/mail'): string {
  const cleanName = name.replace(/Mail$/i, '');
  const className = `${cleanName}Mail`;
  const fileName = `${className}.ts`;
  const filePath = join(process.cwd(), targetDir, fileName);

  mkdirSync(dirname(filePath), { recursive: true });

  const content = `import { MailMessage } from 'aerojs';

export class ${className} {
  constructor(public data: Record<string, any> = {}) {}

  public build(msg: MailMessage): void {
    msg.subject('${cleanName} Notification')
       .text('Hello from ${className}')
       .html('<h1>Hello</h1><p>This is a notification from <strong>${className}</strong>.</p>');
  }
}

export default ${className};
`;

  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function makePolicy(name: string, targetDir = 'app/policies'): string {
  const cleanName = name.replace(/Policy$/i, '');
  const className = `${cleanName}Policy`;
  const fileName = `${className}.ts`;
  const filePath = join(process.cwd(), targetDir, fileName);

  mkdirSync(dirname(filePath), { recursive: true });

  const content = `export class ${className} {
  public view(user: any, resource?: any): boolean {
    return true;
  }

  public create(user: any): boolean {
    return user.role === 'admin' || user.role === 'editor';
  }

  public update(user: any, resource: any): boolean {
    return user.id === resource.userId || user.role === 'admin';
  }

  public delete(user: any, resource: any): boolean {
    return user.role === 'admin';
  }
}

export default ${className};
`;

  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function makeEvent(name: string, targetDir = 'app/events'): string {
  const cleanName = name.replace(/Event$/i, '');
  const className = `${cleanName}Event`;
  const fileName = `${className}.ts`;
  const filePath = join(process.cwd(), targetDir, fileName);

  mkdirSync(dirname(filePath), { recursive: true });

  const content = `import { DomainEvent } from 'aerojs';

export class ${className} extends DomainEvent {
  constructor(public payload: Record<string, any> = {}) {
    super();
  }
}

export default ${className};
`;

  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function makeListener(name: string, targetDir = 'app/listeners'): string {
  const cleanName = name.replace(/Listener$/i, '');
  const className = `${cleanName}Listener`;
  const fileName = `${className}.ts`;
  const filePath = join(process.cwd(), targetDir, fileName);

  mkdirSync(dirname(filePath), { recursive: true });

  const content = `export class ${className} {
  public async handle(event: any): Promise<void> {
    console.log('Handled event in ${className}:', event);
  }
}

export default ${className};
`;

  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
