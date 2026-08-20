// Teklifbul Rule v1.0 — Windows PATHEXT contains .JS, so `firebase` in this
// repo resolves to ./firebase.js (client SDK) and opens it in the default
// editor (Antigravity / VS Code) instead of the Firebase CLI.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const candidates = [];

try {
  candidates.push(createRequire(import.meta.url).resolve('firebase-tools/lib/bin/firebase.js'));
} catch {
  // firebase-tools is not a local dependency
}

if (process.env.APPDATA) {
  candidates.push(path.join(
    process.env.APPDATA,
    'npm',
    'node_modules',
    'firebase-tools',
    'lib',
    'bin',
    'firebase.js'
  ));
}

const cli = candidates.find((filePath) => existsSync(filePath));
if (!cli) {
  console.error('firebase-tools CLI bulunamadı. Kurulum: npm i -g firebase-tools');
  process.exit(1);
}

const child = spawn(process.execPath, [cli, ...args], {
  stdio: 'inherit',
  windowsHide: true,
  env: {
    ...process.env,
    FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || '60',
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
