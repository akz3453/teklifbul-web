#!/usr/bin/env node
/**
 * Teklifbul Rule v1.0 - Production smoke test
 *
 * Spawns the API server, waits for it to come up on /health, validates the
 * response and exits with a non-zero code on failure. Intended to be run
 * locally before deploys (`npm run smoke`) and from CI as a sanity check.
 *
 * Notes:
 *  - DB or Redis may legitimately be unavailable in CI; we accept either
 *    `status: ok` (200) or `status: degraded` (503) as long as the response
 *    is well-formed JSON. Only a hard failure (no response, malformed JSON,
 *    timeout) is treated as a smoke failure.
 *  - The script never imports app code; it talks to the running server over
 *    HTTP so we exercise the same surface that production traffic will hit.
 */

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';

// server/index.ts ile ayni varsayilan (PORT yoksa API 5174 dinler)
const PORT = process.env.SMOKE_PORT || process.env.PORT || '5174';
const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const HEALTH_URL = `http://${HOST}:${PORT}/health`;
const STARTUP_TIMEOUT_MS = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS || 60_000);
const POLL_INTERVAL_MS = 1_000;

const TAG = '[smoke]';

function log(msg, extra) {
  if (extra !== undefined) {
    console.log(`${TAG} ${msg}`, extra);
  } else {
    console.log(`${TAG} ${msg}`);
  }
}

function logErr(msg, extra) {
  if (extra !== undefined) {
    console.error(`${TAG} ❌ ${msg}`, extra);
  } else {
    console.error(`${TAG} ❌ ${msg}`);
  }
}

async function fetchHealth() {
  try {
    const res = await fetch(HEALTH_URL, { method: 'GET' });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, raw: text, error: 'invalid_json' };
    }
    return { ok: res.ok || res.status === 503, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function waitForServer(deadline) {
  let lastErr;
  while (Date.now() < deadline) {
    const result = await fetchHealth();
    if (result.body) {
      return result;
    }
    lastErr = result.error || 'no_response';
    await delay(POLL_INTERVAL_MS);
  }
  return { ok: false, error: lastErr || 'timeout' };
}

async function main() {
  log(`API smoke test baslatiliyor: ${HEALTH_URL}`);

  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: String(PORT),
    SMOKE: '1',
    HOST,
  };

  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'api'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  let serverOutput = '';
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    serverOutput += text;
    process.stdout.write(`[api] ${text}`);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    serverOutput += text;
    process.stderr.write(`[api] ${text}`);
  });

  const start = performance.now();
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  const cleanup = async (code = 0) => {
    if (!child.killed) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        } else {
          child.kill('SIGTERM');
        }
      } catch (e) {
        logErr('Sunucu kapatma hatasi', e);
      }
      // Give the child a moment to exit gracefully
      await delay(500);
    }
    process.exit(code);
  };

  process.on('SIGINT', () => cleanup(130));
  process.on('SIGTERM', () => cleanup(143));

  try {
    const result = await waitForServer(deadline);
    const elapsedMs = Math.round(performance.now() - start);

    if (!result.body) {
      logErr(`Sunucu ${STARTUP_TIMEOUT_MS}ms icinde yanit vermedi: ${result.error}`);
      logErr('Son sunucu ciktisi:', serverOutput.split('\n').slice(-20).join('\n'));
      await cleanup(1);
      return;
    }

    log(`Health endpoint yaniti (${elapsedMs}ms, HTTP ${result.status}):`);
    console.log(JSON.stringify(result.body, null, 2));

    const status = result.body.status;
    if (status !== 'ok' && status !== 'degraded') {
      logErr(`Beklenmeyen status: ${status}`);
      await cleanup(1);
      return;
    }

    if (status === 'degraded') {
      log('UYARI: status=degraded - DB/Redis kontrol edin (smoke icin kabul edildi)');
    } else {
      log('Tum bilesenler saglikli (status=ok)');
    }

    log('Smoke test BASARILI');
    await cleanup(0);
  } catch (err) {
    logErr('Beklenmedik hata:', err);
    await cleanup(1);
  }
}

main().catch((err) => {
  logErr('Fatal hata:', err);
  process.exit(1);
});
