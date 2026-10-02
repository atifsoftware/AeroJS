/**
 * @file new.ts
 * @description Multi-Template CLI Scaffolding for AeroJS official starter kits.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { initProject } from './init.js';

export const AVAILABLE_TEMPLATES = ['fullstack', 'api-starter', 'react-inertia', 'vue-inertia'];

export function createNewProject(projectName: string, template: string) {
  if (!AVAILABLE_TEMPLATES.includes(template)) {
    console.error(`Unknown template '${template}'. Available templates: ${AVAILABLE_TEMPLATES.join(', ')}`);
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(targetDir)) {
    console.error(`Error: Directory '${projectName}' already exists.`);
    process.exit(1);
  }

  if (template === 'fullstack') {
    fs.mkdirSync(targetDir, { recursive: true });
    initProject(projectName, { name: projectName, template: 'fullstack' });
    console.log(`\n🎉 Successfully created AeroJS fullstack application in "${projectName}"!`);
    console.log('Next steps:');
    console.log(`  1. cd ${projectName}`);
    console.log('  2. npm install');
    console.log('  3. npm run dev\n');
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`\n🚀 Scaffolding AeroJS [${template}] application in "${projectName}"...\n`);

  // General configuration files
  fs.writeFileSync(path.join(targetDir, 'package.json'), generatePackageJson(projectName, template));
  fs.writeFileSync(path.join(targetDir, 'tsconfig.json'), generateTsConfig());
  fs.writeFileSync(path.join(targetDir, '.env.example'), generateEnvExample(template));
  fs.writeFileSync(path.join(targetDir, 'README.md'), generateReadme(projectName, template));

  // Scaffold specific templates
  if (template === 'api-starter') scaffoldApiStarter(targetDir);
  else if (template === 'react-inertia') scaffoldReactInertia(targetDir);
  else if (template === 'vue-inertia') scaffoldVueInertia(targetDir);

  console.log(`\n🎉 Successfully created AeroJS application!`);
  console.log('Next steps:');
  console.log(`  1. cd ${projectName}`);
  console.log('  2. npm install');
  console.log('  3. cp .env.example .env');
  console.log('  4. npm run dev\n');
}

function generatePackageJson(projectName: string, template: string) {
  const deps: Record<string, string> = { aerojs: 'latest' };
  const devDeps: Record<string, string> = { typescript: '^5.0.0', tsx: '^4.0.0' };

  if (template.includes('react')) {
    deps['react'] = '^18.0.0';
    deps['react-dom'] = '^18.0.0';
    deps['@inertiajs/react'] = '^1.0.0';
    devDeps['vite'] = '^5.0.0';
    devDeps['@vitejs/plugin-react'] = '^4.0.0';
  } else if (template.includes('vue')) {
    deps['vue'] = '^3.0.0';
    deps['@inertiajs/vue3'] = '^1.0.0';
    devDeps['vite'] = '^5.0.0';
    devDeps['@vitejs/plugin-vue'] = '^5.0.0';
  }

  const pkg = {
    name: projectName,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: template.includes('inertia') ? 'vite' : 'tsx watch server.ts',
      build: template.includes('inertia') ? 'vite build' : 'tsc'
    },
    dependencies: deps,
    devDependencies: devDeps
  };
  return JSON.stringify(pkg, null, 2);
}

function generateTsConfig() {
  return JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      jsx: "react-jsx"
    }
  }, null, 2);
}

function generateEnvExample(template: string) {
  let env = `APP_NAME=AeroJS
APP_ENV=local
APP_DEBUG=true
PORT=3000

DB_CONNECTION=sqlite
DB_DATABASE=storage/database.sqlite
`;
  if (template === 'api-starter') {
    env += `\nCACHE_DRIVER=redis\nREDIS_HOST=127.0.0.1\nREDIS_PORT=6379\n`;
  }
  return env;
}

function generateReadme(name: string, template: string) {
  return `# ${name}\n\nGenerated with AeroJS \`${template}\` starter kit.\n\nRun \`npm run dev\` to start.`;
}

// --- Specific Scaffolders ---

function scaffoldApiStarter(dir: string) {
  fs.mkdirSync(path.join(dir, 'app/controllers'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'app/models'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'app/services'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'routes'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'routes/api.ts'), `
import { Router } from 'aerojs';
const router = new Router();
router.get('/', (ctx) => ctx.json({ status: 'ok' }));
export default router;
  `.trim());

  fs.writeFileSync(path.join(dir, 'server.ts'), `
import { Aero } from 'aerojs';
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from 'aerojs/graphql';
import apiRoutes from './routes/api.js';

const app = new Aero();

app.useDiagnostics();

const schema = new GraphQLSchema({
  query: new GraphQLObjectType('Query', () => ({
    ping: { type: GraphQLString, resolve: () => 'pong' }
  }))
});
app.useGraphQL({ schema, playground: true });

app.router.mount('/api', apiRoutes);
app.listen(3000, () => console.log('API Server running on port 3000'));
  `.trim());
}

function scaffoldReactInertia(dir: string) {
  fs.mkdirSync(path.join(dir, 'resources/js/Pages/Auth'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'vite.config.ts'), `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()] });
  `.trim());

  fs.writeFileSync(path.join(dir, 'resources/js/Pages/Home.tsx'), `
import React from 'react';
export default function Home({ user }) {
  return <div>Welcome to AeroJS + React! {user?.name}</div>;
}
  `.trim());

  fs.writeFileSync(path.join(dir, 'server.ts'), `
import { Aero } from 'aerojs';
const app = new Aero();
app.useInertia({ version: '1.0' });
app.get('/', (ctx) => ctx.inertia.render('Home'));
app.listen(3000);
  `.trim());
}

function scaffoldVueInertia(dir: string) {
  fs.mkdirSync(path.join(dir, 'resources/js/Pages/Auth'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'vite.config.ts'), `
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()] });
  `.trim());

  fs.writeFileSync(path.join(dir, 'resources/js/Pages/Home.vue'), `
<template><div>Welcome to AeroJS + Vue!</div></template>
  `.trim());
}
