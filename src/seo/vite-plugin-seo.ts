/**
 * Teklifbul Rule v1.0 — Build-time SEO: crawler-visible meta, sitemap, robots.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { IndexHtmlTransformContext, Plugin } from 'vite';
import {
  CANONICAL_ORIGIN,
  OG_IMAGE_PATH,
  SITE_NAME,
  buildHomeJsonLd,
  buildRobotsTxt,
  buildSitemapXml,
  canonicalUrl,
  getPublicPageSeo,
  normalizeHtmlPath,
} from './site';

const SEO_START = '<!-- nefisoft-seo -->';
const SEO_END = '<!-- /nefisoft-seo -->';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function stripSeoBlock(html: string): string {
  const blockRe = new RegExp(`${SEO_START}[\\s\\S]*?${SEO_END}\\n?`, 'g');
  return html.replace(blockRe, '');
}

function injectBeforeHeadClose(html: string, snippet: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${snippet}\n</head>`);
  }
  return `${html}\n${snippet}\n`;
}

function upsertTitle(html: string, title: string): string {
  if (/<title>[^<]*<\/title>/i.test(html)) {
    return html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(title)}</title>`);
  }
  return injectBeforeHeadClose(html, `  <title>${escapeAttr(title)}</title>`);
}

function buildSeoSnippet(htmlPath: string): string {
  const publicPage = getPublicPageSeo(htmlPath);
  const title = publicPage?.title;
  const description = publicPage?.description;
  const robots = publicPage?.robots || (publicPage ? 'index, follow' : 'noindex, nofollow');
  const indexable = robots.startsWith('index');
  const canonical = publicPage ? canonicalUrl(htmlPath) : '';
  const ogImage = `${CANONICAL_ORIGIN}${OG_IMAGE_PATH}`;

  const lines = [
    `  ${SEO_START}`,
    `  <meta name="robots" content="${robots}" />`,
    `  <script>(function(){var h=location.hostname;if(h==="teklifbul.web.app"||h==="teklifbul.firebaseapp.com"){location.replace("${CANONICAL_ORIGIN}"+location.pathname+location.search+location.hash);}})();</script>`,
  ];

  if (publicPage && description) {
    lines.push(`  <meta name="description" content="${escapeAttr(description)}" />`);
  }
  if (canonical) {
    lines.push(`  <link rel="canonical" href="${escapeAttr(canonical)}" />`);
  }
  if (indexable && canonical) {
    lines.push(`  <meta property="og:type" content="website" />`);
    lines.push(`  <meta property="og:site_name" content="${SITE_NAME}" />`);
    lines.push(`  <meta property="og:locale" content="tr_TR" />`);
    lines.push(`  <meta property="og:url" content="${escapeAttr(canonical)}" />`);
    if (title) {
      lines.push(`  <meta property="og:title" content="${escapeAttr(title)}" />`);
    }
    if (description) {
      lines.push(`  <meta property="og:description" content="${escapeAttr(description)}" />`);
    }
    lines.push(`  <meta property="og:image" content="${escapeAttr(ogImage)}" />`);
    lines.push(`  <meta name="twitter:card" content="summary_large_image" />`);
    if (title) {
      lines.push(`  <meta name="twitter:title" content="${escapeAttr(title)}" />`);
    }
    if (description) {
      lines.push(`  <meta name="twitter:description" content="${escapeAttr(description)}" />`);
    }
    lines.push(`  <meta name="twitter:image" content="${escapeAttr(ogImage)}" />`);
  }
  lines.push('  <link rel="icon" href="/favicon.ico" />');
  if (publicPage?.jsonLd) {
    const payload = JSON.stringify(buildHomeJsonLd());
    lines.push(`  <script type="application/ld+json">${payload}</script>`);
  }
  lines.push(`  ${SEO_END}`);
  return lines.join('\n');
}

function applySeo(html: string, htmlPath: string): string {
  if (!htmlPath.endsWith('.html')) {
    return html;
  }

  let next = stripSeoBlock(html);
  const publicPage = getPublicPageSeo(htmlPath);
  if (publicPage?.title) {
    next = upsertTitle(next, publicPage.title);
  }
  if (publicPage) {
    next = next.replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, '');
  }
  next = next.replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi, '');
  next = next.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '');

  return injectBeforeHeadClose(next, buildSeoSnippet(htmlPath));
}

function transformHtml(html: string, ctx: IndexHtmlTransformContext): string {
  const htmlPath = normalizeHtmlPath(ctx.path || '', ctx.filename || '');
  return applySeo(html, htmlPath);
}

function listHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'assets' || ent.name === 'node_modules') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listHtmlFiles(full));
    } else if (ent.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function applySeoToDist(outDir: string): void {
  for (const file of listHtmlFiles(outDir)) {
    const htmlPath = `/${path.relative(outDir, file).replace(/\\/g, '/')}`;
    const html = fs.readFileSync(file, 'utf8');
    const next = applySeo(html, htmlPath);
    if (next !== html) {
      fs.writeFileSync(file, next, 'utf8');
    }
  }
}

function writeDistFile(outDir: string, fileName: string, contents: string): void {
  const dest = path.join(outDir, fileName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents, 'utf8');
}

export function nefisoftSeoPlugin(projectRoot: string): Plugin {
  return {
    name: 'nefisoft-seo',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        return transformHtml(html, ctx);
      },
    },
    closeBundle() {
      const outDir = path.join(projectRoot, 'dist');
      if (!fs.existsSync(outDir)) return;
      applySeoToDist(outDir);
      writeDistFile(outDir, 'robots.txt', buildRobotsTxt());
      writeDistFile(outDir, 'sitemap.xml', buildSitemapXml());
    },
  };
}
