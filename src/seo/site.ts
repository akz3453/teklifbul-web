/**
 * Teklifbul Rule v1.0 — Public SEO source of truth (crawler reads HTML, not JS).
 */

export const CANONICAL_ORIGIN = 'https://nefisoft.com';
export const SITE_NAME = 'NEFISOFT';
export const OG_IMAGE_PATH = '/assets/images/brand/nefisoft-web-horizontal.png';
export const DEFAULT_DESCRIPTION =
  'NEFISOFT ile satın alma, teklif, stok ve satış operasyonlarını tek merkezden yönetin. Teklifbul, NEFISOFT’un satın alma ve teklif modülüdür.';

export type PublicPageSeo = {
  path: string;
  title: string;
  description: string;
  changefreq?: 'daily' | 'weekly' | 'monthly';
  priority?: number;
  jsonLd?: boolean;
  robots?: 'index, follow' | 'noindex, nofollow';
  sitemap?: boolean;
};

const INDEX_FOLLOW = 'index, follow' as const;
const NOINDEX = 'noindex, nofollow' as const;

export const PUBLIC_PAGES: PublicPageSeo[] = [
  {
    path: '/index.html',
    title: 'NEFISOFT — Satın Alma ve Teklif Yönetimi',
    description: DEFAULT_DESCRIPTION,
    changefreq: 'weekly',
    priority: 1,
    jsonLd: true,
    robots: INDEX_FOLLOW,
    sitemap: true,
  },
  {
    path: '/contact.html',
    title: 'İletişim — NEFISOFT',
    description: 'NEFISOFT iletişim: satış, destek ve iş birliği talepleriniz için bize yazın.',
    changefreq: 'monthly',
    priority: 0.7,
    robots: INDEX_FOLLOW,
    sitemap: true,
  },
  {
    path: '/forum.html',
    title: 'Forum — NEFISOFT (Yakında)',
    description: 'NEFISOFT kullanıcı forumu yakında açılacak.',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/login.html',
    title: 'Giriş Yap — NEFISOFT',
    description: 'NEFISOFT hesabınıza giriş yapın.',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/signup.html',
    title: 'Kayıt Ol — NEFISOFT',
    description: 'NEFISOFT’u ücretsiz deneyin. Satın alma ve teklif süreçlerinizi tek yerden yönetin.',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/register-buyer.html',
    title: 'Alıcı Kayıt — NEFISOFT',
    description: 'Alıcı olarak NEFISOFT’a kayıt olun.',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/legal/kvkk-politika.html',
    title: 'KVKK Politikası — NEFISOFT',
    description: 'NEFISOFT Kişisel Verilerin Korunması (KVKK) politikası (taslak).',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/legal/kvkk-aydinlatma.html',
    title: 'KVKK Aydınlatma Metni — NEFISOFT',
    description: 'NEFISOFT KVKK aydınlatma metni (taslak).',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/legal/acik-riza.html',
    title: 'Açık Rıza Bilgilendirme Metni — NEFISOFT',
    description: 'NEFISOFT açık rıza bilgilendirme metni (taslak).',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/legal/cerez-politikasi.html',
    title: 'Çerez Politikası — NEFISOFT',
    description: 'NEFISOFT çerez politikası: sitede kullanılan çerezler ve tercihleriniz.',
    changefreq: 'yearly',
    priority: 0.3,
    robots: INDEX_FOLLOW,
    sitemap: true,
  },
  {
    path: '/legal/mesafeli-satis.html',
    title: 'Mesafeli Satış Sözleşmesi — NEFISOFT',
    description: 'NEFISOFT mesafeli satış sözleşmesi (taslak).',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/legal/elektronik-bilgilendirme.html',
    title: 'Elektronik Ticari İleti Bilgilendirme — NEFISOFT',
    description: 'NEFISOFT elektronik ticari ileti bilgilendirme metni (taslak).',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/legal/alici-sozlesme.html',
    title: 'Alıcı Kullanıcı Sözleşmesi — NEFISOFT',
    description: 'NEFISOFT alıcı kullanıcı sözleşmesi (taslak).',
    robots: NOINDEX,
    sitemap: false,
  },
  {
    path: '/legal/tedarikci-sozlesme.html',
    title: 'Tedarikçi Kullanıcı Sözleşmesi — NEFISOFT',
    description: 'NEFISOFT tedarikçi kullanıcı sözleşmesi (taslak).',
    robots: NOINDEX,
    sitemap: false,
  },
];

const PUBLIC_PATH_SET = new Set(PUBLIC_PAGES.map((page) => page.path));

function pageByPath(htmlPath: string): PublicPageSeo | null {
  const path = htmlPath === '/' ? '/index.html' : htmlPath;
  return PUBLIC_PAGES.find((page) => page.path === path) || null;
}

export function isIndexablePublicPage(page: PublicPageSeo): boolean {
  return (page.robots || INDEX_FOLLOW).startsWith('index');
}

export function shouldIncludeInSitemap(page: PublicPageSeo | null | undefined): boolean {
  if (!page || page.sitemap === false) return false;
  return isIndexablePublicPage(page);
}

export function normalizeHtmlPath(rawPath: string, filename = ''): string {
  const fromFile = filename.replace(/\\/g, '/');
  const legalIdx = fromFile.lastIndexOf('/legal/');
  if (legalIdx !== -1) {
    return `/legal/${fromFile.slice(legalIdx + '/legal/'.length)}`;
  }

  const baseName = fromFile.split('/').pop() || '';
  let p = String(rawPath || '').replace(/\\/g, '/');
  if (!p && baseName.endsWith('.html')) p = `/${baseName}`;
  if (!p || p === '/' || p === '/index.html') return '/index.html';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.endsWith('/index.html')) return '/index.html';
  return p;
}

export function getPublicPageSeo(htmlPath: string): PublicPageSeo | null {
  return pageByPath(htmlPath);
}

export function isPublicHtmlPath(htmlPath: string): boolean {
  return PUBLIC_PATH_SET.has(htmlPath === '/' ? '/index.html' : htmlPath);
}

export function canonicalUrl(htmlPath: string): string {
  if (htmlPath === '/index.html' || htmlPath === '/') return `${CANONICAL_ORIGIN}/`;
  return `${CANONICAL_ORIGIN}${htmlPath}`;
}

export function buildHomeJsonLd(): object[] {
  const home = PUBLIC_PAGES[0];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: CANONICAL_ORIGIN,
      logo: `${CANONICAL_ORIGIN}/assets/images/brand/nefisoft-app-mark.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: CANONICAL_ORIGIN,
      inLanguage: 'tr',
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: CANONICAL_ORIGIN,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: CANONICAL_ORIGIN,
      description: home.description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'TRY',
      },
    },
  ];
}

export function buildRobotsTxt(): string {
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    'Disallow: /api/',
    'Disallow: /test/',
    'Disallow: /test-fixtures/',
    'Disallow: /pages/',
    'Disallow: /admin/',
    'Disallow: /dashboard.html',
    'Disallow: /settings.html',
    'Disallow: /demands.html',
    'Disallow: /demand-detail.html',
    'Disallow: /demand-new.html',
    'Disallow: /demand-new.desktop.html',
    'Disallow: /internal-demands.html',
    'Disallow: /internal-demand-new.html',
    'Disallow: /internal-demand-detail.html',
    'Disallow: /bids.html',
    'Disallow: /bids-incoming.html',
    'Disallow: /bids-outgoing.html',
    'Disallow: /bid-detail.html',
    'Disallow: /bid-upload.html',
    'Disallow: /bid-repair.html',
    'Disallow: /submit-bid.html',
    'Disallow: /contracts.html',
    'Disallow: /contract-edit.html',
    'Disallow: /contract-detail.html',
    'Disallow: /inventory-index.html',
    'Disallow: /company-join.html',
    'Disallow: /company-join-waiting.html',
    'Disallow: /company-invite.html',
    'Disallow: /company-profile.html',
    'Disallow: /role-select.html',
    'Disallow: /role-permissions-management.html',
    'Disallow: /revision-request.html',
    'Disallow: /main-demands.html',
    'Disallow: /add-satfk.html',
    'Disallow: /interim-payments.html',
    'Disallow: /interim-payment-edit.html',
    'Disallow: /interim-payment-suggestions.html',
    'Disallow: /payment-request.html',
    'Disallow: /admin-delete-all.html',
    'Disallow: /fefo-dashboard.html',
    'Disallow: /fefo-pos.html',
    '',
    `Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`,
    '',
  ];
  return lines.join('\n');
}

export function buildSitemapXml(lastmod = '2026-08-16'): string {
  const urls = PUBLIC_PAGES.filter(shouldIncludeInSitemap).map((page) => {
    const loc = canonicalUrl(page.path);
    const changefreq = page.changefreq || 'monthly';
    const priority = (page.priority ?? 0.5).toFixed(1);
    return [
      '  <url>',
      `    <loc>${loc}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
