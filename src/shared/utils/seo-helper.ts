/**
 * SEO Meta Tags Helper
 * Teklifbul Rule v1.0 - SEO Optimization
 *
 * Crawler-facing tags are injected at build time (`src/seo/vite-plugin-seo.ts`).
 * This helper is for rare client-side title updates (e.g. demand detail).
 */

import { CANONICAL_ORIGIN, DEFAULT_DESCRIPTION, OG_IMAGE_PATH, SITE_NAME } from '../../seo/site';

export { CANONICAL_ORIGIN, DEFAULT_DESCRIPTION, OG_IMAGE_PATH, SITE_NAME };

export interface MetaTagsConfig {
    title: string;
    description: string;
    keywords?: string[];
    author?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogUrl?: string;
    twitterCard?: 'summary' | 'summary_large_image';
    canonical?: string;
}

export function updateMetaTags(config: MetaTagsConfig): void {
    document.title = config.title;
    setMetaTag('description', config.description);

    if (config.keywords && config.keywords.length > 0) {
        setMetaTag('keywords', config.keywords.join(', '));
    }

    if (config.author) {
        setMetaTag('author', config.author);
    }

    setMetaTag('og:title', config.ogTitle || config.title, 'property');
    setMetaTag('og:description', config.ogDescription || config.description, 'property');
    setMetaTag('og:type', 'website', 'property');

    if (config.ogImage) {
        setMetaTag('og:image', config.ogImage, 'property');
    }

    if (config.ogUrl) {
        setMetaTag('og:url', config.ogUrl, 'property');
    }

    setMetaTag('twitter:card', config.twitterCard || 'summary');
    setMetaTag('twitter:title', config.ogTitle || config.title);
    setMetaTag('twitter:description', config.ogDescription || config.description);

    if (config.ogImage) {
        setMetaTag('twitter:image', config.ogImage);
    }

    if (config.canonical) {
        setCanonicalUrl(config.canonical);
    }
}

function setMetaTag(name: string, content: string, attribute: 'name' | 'property' = 'name'): void {
    let element = document.querySelector(`meta[${attribute}="${name}"]`) as HTMLMetaElement;

    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
    }

    element.content = content;
}

function setCanonicalUrl(url: string): void {
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;

    if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
    }

    link.href = url;
}

export function addStructuredData(data: object): void {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
}

export const SEO_CONFIGS = {
    home: {
        title: `${SITE_NAME} — Uçtan Uca Ticari Operasyon Yönetimi`,
        description: DEFAULT_DESCRIPTION,
        keywords: ['b2b', 'teklif', 'satın alma', 'stok', 'e-fatura', 'nefisoft'],
        ogImage: OG_IMAGE_PATH,
        canonical: `${CANONICAL_ORIGIN}/`,
    },
} as const;
