#!/usr/bin/env node
/**
 * Teklifbul Rule v1.0 — rolePermissionsTemplate.json'u functions/dist'e kopyala
 * Cloud Functions cwd altında fs read için.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src', 'shared', 'data', 'rolePermissionsTemplate.json');
const targets = [
  path.join(ROOT, 'functions', 'dist', 'src', 'shared', 'data', 'rolePermissionsTemplate.json'),
  path.join(ROOT, 'functions', 'src', 'shared', 'data', 'rolePermissionsTemplate.json'),
];

if (!fs.existsSync(SRC)) {
  console.error('copy-role-permissions-template: source missing', SRC);
  process.exit(1);
}

for (const dest of targets) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(SRC, dest);
  console.log('copied rolePermissionsTemplate ->', path.relative(ROOT, dest));
}
