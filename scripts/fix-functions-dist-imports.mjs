#!/usr/bin/env node
/**
 * Teklifbul Rule v1.0 - Firebase Functions dist ESM import düzeltmesi
 * build:api sonrası functions/dist içindeki relative importlara .js ekler.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST_ROOT = path.resolve(process.cwd(), 'functions', 'dist');

const EXT_SKIP = new Set(['.js', '.mjs', '.cjs', '.json', '.node', '.ts']);

function needsJsExtension(specifier) {
  if (!specifier.startsWith('.')) return false;
  const ext = path.posix.extname(specifier);
  if (ext && EXT_SKIP.has(ext)) return false;
  return true;
}

function withJsExtension(specifier) {
  if (!needsJsExtension(specifier)) return specifier;
  return `${specifier}.js`;
}

function patchSource(code) {
  let out = code;

  // import ... from './x' | export ... from './x'
  out = out.replace(
    /(\bfrom\s+['"])(\.[^'"]+)(['"])/g,
    (_m, pre, spec, post) => `${pre}${withJsExtension(spec)}${post}`
  );

  // import './x' (side-effect)
  out = out.replace(
    /(\bimport\s+['"])(\.[^'"]+)(['"])/g,
    (_m, pre, spec, post) => `${pre}${withJsExtension(spec)}${post}`
  );

  // import('./x') dynamic
  out = out.replace(
    /(\bimport\s*\(\s*['"])(\.[^'"]+)(['"]\s*\))/g,
    (_m, pre, spec, post) => `${pre}${withJsExtension(spec)}${post}`
  );

  // export * from './x'
  out = out.replace(
    /(\bexport\s+\*\s+from\s+['"])(\.[^'"]+)(['"])/g,
    (_m, pre, spec, post) => `${pre}${withJsExtension(spec)}${post}`
  );

  return out;
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (name.endsWith('.js')) files.push(full);
  }
  return files;
}

function main() {
  if (!fs.existsSync(DIST_ROOT)) {
    console.error('[fix-functions-dist-imports] dist bulunamadı:', DIST_ROOT);
    process.exit(1);
  }

  const files = walk(DIST_ROOT);
  let changed = 0;

  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = patchSource(before);
    if (after !== before) {
      fs.writeFileSync(file, after, 'utf8');
      changed += 1;
    }
  }

  console.log(`[fix-functions-dist-imports] ${changed}/${files.length} dosya güncellendi`);
}

main();
