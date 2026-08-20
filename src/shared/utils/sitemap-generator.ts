/**
 * Sitemap Generator
 * Teklifbul Rule v1.0 - SEO Optimization
 * 
 * Dinamik sitemap.xml oluşturur
 */

interface SitemapUrl {
    loc: string;
    lastmod?: string;
    changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    priority?: number;
}

/**
 * Sitemap XML oluştur
 */
export function generateSitemap(urls: SitemapUrl[]): string {
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
function escapeXml(str: string): string {
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
export const SITEMAP_URLS: SitemapUrl[] = [
    {
        loc: 'https://nefisoft.com/',
        changefreq: 'weekly',
        priority: 1.0
    },
    {
        loc: 'https://nefisoft.com/contact.html',
        changefreq: 'monthly',
        priority: 0.7
    },
    {
        loc: 'https://nefisoft.com/legal/cerez-politikasi.html',
        changefreq: 'yearly',
        priority: 0.3
    }
];

/**
 * Kullanım:
 * 
 * ```typescript
 * import { generateSitemap, SITEMAP_URLS } from './sitemap-generator';
 * 
 * // Sitemap oluştur
 * const sitemap = generateSitemap(SITEMAP_URLS);
 * 
 * // Dosyaya yaz
 * fs.writeFileSync('public/sitemap.xml', sitemap);
 * ```
 */
