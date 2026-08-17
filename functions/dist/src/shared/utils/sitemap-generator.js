"use strict";
/**
 * Sitemap Generator
 * Teklifbul Rule v1.0 - SEO Optimization
 *
 * Dinamik sitemap.xml oluşturur
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SITEMAP_URLS = void 0;
exports.generateSitemap = generateSitemap;
/**
 * Sitemap XML oluştur
 */
function generateSitemap(urls) {
    const urlEntries = urls.map(url => `
  <url>
    <loc>${escapeXml(url.loc)}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}
    ${url.changefreq ? `<changefreq>${url.changefreq}</changefreq>` : ''}
    ${url.priority !== undefined ? `<priority>${url.priority}</priority>` : ''}
  </url>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}
/**
 * XML escape
 */
function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
/**
 * TeklifBul sitemap URLs
 */
exports.SITEMAP_URLS = [
    {
        loc: 'https://teklifbul.com/',
        changefreq: 'daily',
        priority: 1.0
    },
    {
        loc: 'https://teklifbul.com/login.html',
        changefreq: 'monthly',
        priority: 0.8
    },
    {
        loc: 'https://teklifbul.com/signup.html',
        changefreq: 'monthly',
        priority: 0.8
    },
    {
        loc: 'https://teklifbul.com/register-buyer.html',
        changefreq: 'monthly',
        priority: 0.8
    },
    {
        loc: 'https://teklifbul.com/contact.html',
        changefreq: 'monthly',
        priority: 0.6
    },
    {
        loc: 'https://teklifbul.com/forum.html',
        changefreq: 'weekly',
        priority: 0.7
    }
];
/**
 * Kullanım:
 *
 * ```typescript
 * import { generateSitemap, SITEMAP_URLS } from './sitemap-generator.js';
 *
 * // Sitemap oluştur
 * const sitemap = generateSitemap(SITEMAP_URLS);
 *
 * // Dosyaya yaz
 * fs.writeFileSync('public/sitemap.xml', sitemap);
 * ```
 */
