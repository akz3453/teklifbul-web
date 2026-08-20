#!/usr/bin/env node
/**
 * Teklifbul Rule v1.0 — SEO smoke against dist/ after Vite build.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const fail = [];

function read(rel) {
  const p = resolve(dist, rel);
  if (!existsSync(p)) {
    fail.push(`missing ${rel}`);
    return '';
  }
  return readFileSync(p, 'utf8');
}

if (!existsSync(dist)) {
  console.error('[seo-smoke] dist/ yok — önce npm run build');
  process.exit(1);
}

const sitemap = read('sitemap.xml');
const robots = read('robots.txt');
const home = read('index.html');
const login = read('login.html');
const signup = read('signup.html');
const forum = read('forum.html');
const legal = read('legal/kvkk-aydinlatma.html');
const cerez = read('legal/cerez-politikasi.html');

if (!robots.includes('Sitemap: https://nefisoft.com/sitemap.xml')) fail.push('robots sitemap');
if (!robots.includes('Disallow: /api/')) fail.push('robots api');
if (sitemap.includes('login.html')) fail.push('sitemap has login');
if (sitemap.includes('forum.html')) fail.push('sitemap has forum');
if (sitemap.includes('kvkk-aydinlatma.html')) fail.push('sitemap has draft legal');
if (!sitemap.includes('https://nefisoft.com/</loc>') && !sitemap.includes('https://nefisoft.com</loc>')) {
  if (!sitemap.includes('https://nefisoft.com/')) fail.push('sitemap missing home');
}
if (!sitemap.includes('contact.html')) fail.push('sitemap missing contact');
if (!sitemap.includes('https://nefisoft.com/legal.html')) fail.push('sitemap missing legal hub');
const legalHub = read('legal.html');
if (!legalHub.includes('/legal/cerez-politikasi.html')) fail.push('legal hub missing cerez link');
if (!home.includes('application/ld+json')) fail.push('home missing json-ld');
if (!home.includes('"@type":"WebSite"') && !home.includes('"@type": "WebSite"')) {
  if (!home.includes('WebSite')) fail.push('home missing WebSite json-ld');
}
if (!login.includes('noindex')) fail.push('login not noindex');
if (!signup.includes('noindex')) fail.push('signup not noindex');
if (!forum.includes('noindex')) fail.push('forum not noindex');
if (!legal.includes('noindex')) fail.push('legal draft not noindex');
if (!cerez.includes('index, follow') && !cerez.includes('index,follow')) fail.push('cerez should be indexable');
if (signup.includes('href="#"') && signup.includes('KVKK')) fail.push('signup KVKK still href=#');
if (!signup.includes('/legal/kvkk-aydinlatma.html')) fail.push('signup missing kvkk url');
if (!signup.includes('/legal/alici-sozlesme.html')) fail.push('signup missing sozlesme url');
const submitBid = read('submit-bid.html');
if (submitBid.includes('/css/styles.css')) fail.push('submit-bid broken styles.css');
if (home.includes('play.google.com/store/apps')) fail.push('home still has fake play store url');
if (!home.includes('E-Fatura — Yakında') && !home.includes('E-Fatura — Yakinda') && !home.includes('E-fatura')) {
  if (!home.includes('Yakında')) fail.push('home missing upcoming honesty');
}

if (fail.length) {
  console.error('[seo-smoke] FAIL');
  fail.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('[seo-smoke] OK');
