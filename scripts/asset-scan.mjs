#!/usr/bin/env node
/**
 * Teklifbul Rule v1.0 — Broken CSS asset scan on dist HTML.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
if (!existsSync(dist)) {
  console.error('[asset-scan] dist/ yok — önce npm run build');
  process.exit(1);
}

function listHtml(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      listHtml(full, acc);
    } else if (name.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

function resolveCssPath(htmlFile, href) {
  if (!href || href.startsWith('data:') || href.startsWith('http://') || href.startsWith('https://')) {
    return null;
  }
  const cleaned = href.split('?')[0].split('#')[0];
  if (!cleaned.endsWith('.css')) return null;
  if (cleaned.startsWith('/')) {
    return join(dist, cleaned.replace(/^\//, ''));
  }
  return resolve(dirname(htmlFile), cleaned);
}

const htmlFiles = listHtml(dist);
const missing = [];
const checked = new Set();
const hrefRe = /<link\b[^>]*href="([^"]+)"[^>]*>/gi;

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  let match;
  hrefRe.lastIndex = 0;
  while ((match = hrefRe.exec(html))) {
    const tag = match[0];
    const href = match[1];
    if (!/\bstylesheet\b/i.test(tag) && !href.endsWith('.css')) continue;
    const abs = resolveCssPath(file, href);
    if (!abs) continue;
    const key = `${file}::${href}`;
    if (checked.has(key)) continue;
    checked.add(key);
    if (!existsSync(abs)) {
      missing.push(`${file.replace(dist, 'dist')}: ${href}`);
    }
  }
}

if (missing.length) {
  console.error('[asset-scan] missing CSS referenced by HTML:');
  missing.forEach((row) => console.error(' -', row));
  process.exit(1);
}
console.log(`[asset-scan] OK (${htmlFiles.length} html, ${checked.size} css refs)`);
