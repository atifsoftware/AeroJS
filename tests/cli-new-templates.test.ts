import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createNewProject, AVAILABLE_TEMPLATES } from '../src/cli/commands/new.js';

describe('CLI Multi-Template Scaffolding', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerojs-cli-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('fails if an invalid template is provided', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit()'); });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      createNewProject('test-invalid', 'non-existent-template');
    }).toThrow('process.exit()');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown template 'non-existent-template'. Available templates")
    );

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('scaffolds api-starter template', () => {
    const originalCwd = process.cwd();
    process.chdir(tmpDir);

    const projName = 'my-api';
    createNewProject(projName, 'api-starter');

    const projPath = path.join(tmpDir, projName);
    expect(fs.existsSync(path.join(projPath, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'server.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'routes/api.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'app/models'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(projPath, 'package.json'), 'utf8'));
    expect(pkg.name).toBe(projName);

    const env = fs.readFileSync(path.join(projPath, '.env.example'), 'utf8');
    expect(env).toContain('CACHE_DRIVER=redis');

    process.chdir(originalCwd);
  });

  it('scaffolds react-inertia template', () => {
    const originalCwd = process.cwd();
    process.chdir(tmpDir);

    const projName = 'my-react';
    createNewProject(projName, 'react-inertia');

    const projPath = path.join(tmpDir, projName);
    expect(fs.existsSync(path.join(projPath, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'vite.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'resources/js/Pages/Home.tsx'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(projPath, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@inertiajs/react']).toBeDefined();

    process.chdir(originalCwd);
  });

  it('scaffolds fullstack template matching my-aero-app', () => {
    const originalCwd = process.cwd();
    process.chdir(tmpDir);

    const projName = 'my-fullstack';
    createNewProject(projName, 'fullstack');

    const projPath = path.join(tmpDir, projName);
    expect(fs.existsSync(path.join(projPath, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'server.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'app/views/engine.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'views/index.edge'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'resources/js/app.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projPath, 'AGENTS.md'))).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(projPath, 'package.json'), 'utf8'));
    expect(pkg.dependencies['edge.js']).toBeDefined();
    expect(pkg.dependencies['knex']).toBeDefined();

    process.chdir(originalCwd);
  });
});
