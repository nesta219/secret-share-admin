#!/usr/bin/env node
// esbuild bundles each handler into dist/<name>/index.js, then shell `zip` packages
// dist/<name>/ into dist/<name>.zip. Terraform consumes dist/<name>.zip via
// aws_lambda_function.filename + filebase64sha256(...) for drift detection.

import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const distDir = resolve(repoRoot, 'dist');

const handlers = ['admin', 'canary', 'slack-relay'];

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(distDir, { recursive: true });

for (const name of handlers) {
  const handlerDir = resolve(distDir, name);
  mkdirSync(handlerDir, { recursive: true });

  console.log(`bundling ${name}...`);
  await build({
    entryPoints: [resolve(repoRoot, `src/handlers/${name}.ts`)],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: resolve(handlerDir, 'index.js'),
    external: ['@aws-sdk/*'],
    minify: false,
    sourcemap: false,
    logLevel: 'info',
  });

  console.log(`zipping ${name}.zip...`);
  execSync(`cd "${handlerDir}" && zip -qr "../${name}.zip" .`, { stdio: 'inherit' });
}

console.log(`✓ built ${handlers.length} handlers into ${distDir}`);
