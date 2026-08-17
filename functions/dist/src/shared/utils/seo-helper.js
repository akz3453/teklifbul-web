"use strict";
/**
 * SEO Meta Tags Helper
 * Teklifbul Rule v1.0 - SEO Optimization
 *
 * Dinamik meta tag yönetimi için utility
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEO_CONFIGS = void 0;
exports.updateMetaTags = updateMetaTags;
exports.addStructuredData = addStructuredData;
/**
 * Meta tag'leri güncelle
 */
function updateMetaTags(config) {
    // Title
    document.title = config.title;
    // Description
    setMetaTag('description', config.description);
    // Keywords
    if (config.keywords && config.keywords.length > 0) {
        setMetaTag('keywords', config.keywords.join(', '));
    }
    // Author
    if (config.author) {
        setMetaTag('author', config.author);
    }
    // Open Graph
    setMetaTag('og:title', config.ogTitle || config.title, 'property');
    setMetaTag('og:description', config.ogDescription || config.description, 'property');
    setMetaTag('og:type', 'website', 'property');
    if (config.ogImage) {
        setMetaTag('og:image', config.ogImage, 'property');
    }
    if (config.ogUrl) {
        setMetaTag('og:url', config.ogUrl, 'property');
    }
    // Twitter Card
    setMetaTag('twitter:card', config.twitterCard || 'summary');
    setMetaTag('twitter:title', config.ogTitle || config.title);
    setMetaTag('twitter:description', config.ogDescription || config.description);
    if (config.ogImage) {
        setMetaTag('twitter:image', config.ogImage);
    }
    // Canonical URL
    if (config.canonical) {
        setCanonicalUrl(config.canonical);
    }
}
/**
 * Meta tag set et veya güncelle
 */
function setMetaTag(name, content, attribute = 'name') {
    let element = document.querySelector(`meta[${attribute}="${name}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
    }
    element.content = content;
}
/**
 * Canonical URL set et
 */
function setCanonicalUrl(url) {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
    }
    link.href = url;
}
/**
 * Structured Data (JSON-LD) ekle
 */
function addStructuredData(data) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
}
/**
 * Sayfa bazlı SEO konfigürasyonları
 */
exports.SEO_CONFIGS = {
    home: {
        title: 'TeklifBul - B2B Teklif ve Satın Alma Platformu',
        description: 'TeklifBul ile tedarikçilerden hızlı teklif alın, fiyatları karşılaştırın ve en uygun teklifi seçin. B2B satın alma süreçlerinizi dijitalleştirin.',
        keywords: ['b2b', 'teklif', 'satın alma', 'tedarikçi', 'fiyat karşılaştırma'],
        ogImage: '/assets/og-image.png'
    },
    demands: {
        title: 'Taleplerim - TeklifBul',
        description: 'Satın alma taleplerinizi oluşturun, yönetin ve tedarikçilerden teklif alın.',
        keywords: ['talep', 'satın alma talebi', 'rfq', 'teklif talebi']
    },
    bids: {
        title: 'Teklifler - TeklifBul',
        description: 'Gelen teklifleri görüntüleyin, karşılaştırın ve en uygun teklifi seçin.',
        keywords: ['teklif', 'fiyat teklifi', 'teklif karşılaştırma']
    },
    settings: {
        title: 'Ayarlar - TeklifBul',
        description: 'Hesap ayarlarınızı, şirket bilgilerinizi ve tercihlerinizi yönetin.',
        keywords: ['ayarlar', 'hesap', 'profil']
    }
};
/**
 * Kullanım Örneği:
 *
 * ```typescript
 * import { updateMetaTags, SEO_CONFIGS, addStructuredData } from './seo-helper.js';
 *
 * // Sayfa yüklendiğinde
 * updateMetaTags({
 *   ...SEO_CONFIGS.home,
 *   ogUrl: window.location.href,
 *   canonical: window.location.href
 * });
 *
 * // Structured data ekle
 * addStructuredData({
 *   "@context": "https://schema.org",
 *   "@type": "WebApplication",
 *   "name": "TeklifBul",
 *   "description": "B2B Teklif ve Satın Alma Platformu",
 *   "url": "https://teklifbul.com"
 * });
 * ```
 */
