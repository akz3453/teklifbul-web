#!/usr/bin/env node
/**
 * Deploy öncesi kontrol — Teklifbul Rule v1.0
 * build:api + build + (opsiyonel) smoke
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const TAG = '[preflight]';
const root = process.cwd();
const skipSmoke = process.argv.includes('--skip-smoke');

function log(msg) {
  console.log(`${TAG} ${msg}`);
}

function fail(msg, code = 1) {
  console.error(`${TAG} ❌ ${msg}`);
  process.exit(code);
}

function runStep(label, command, args) {
  log(`▶ ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env },
  });
  if (result.status !== 0) {
    fail(`${label} başarısız (çıkış kodu: ${result.status ?? 'unknown'})`);
  }
  log(`✓ ${label}`);
}

function checkEnvHints() {
  const envPath = resolve(root, '.env');
  const saPath = resolve(root, 'firebase-service-account.json');
  if (!existsSync(envPath) && !process.env.FIREBASE_SERVICE_ACCOUNT) {
    log('⚠ .env bulunamadı — production deploy için .env veya FIREBASE_SERVICE_ACCOUNT gerekir');
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ALLOWED_ORIGINS) {
      log('⚠ ALLOWED_ORIGINS tanımlı değil (production CORS)');
    }
    if (!process.env.APP_URL) {
      log('⚠ APP_URL tanımlı değil');
    }
  }
  if (existsSync(saPath)) {
    log('ℹ firebase-service-account.json mevcut (commit etmeyin)');
  }
}

log('Deploy öncesi kontrol başlıyor...\n');
checkEnvHints();

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
runStep('API TypeScript build', npm, ['run', 'build:api']);
runStep('Vite production build', npm, ['run', 'build']);

if (!skipSmoke) {
  runStep('API smoke test', npm, ['run', 'smoke']);
} else {
  log('Smoke atlandı (--skip-smoke)');
}

log('\n✅ Preflight tamamlandı — deploy için teknik build kontrolleri geçti.');
log('Sonraki adımlar: production env, firebase deploy, domain, monitoring (GO_LIVE_CHECKLIST.md)');
