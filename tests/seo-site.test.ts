import { describe, expect, test } from 'vitest';
import {
  buildRobotsTxt,
  buildSitemapXml,
  canonicalUrl,
  isPublicHtmlPath,
  normalizeHtmlPath,
  shouldIncludeInSitemap,
  getPublicPageSeo,
} from '../src/seo/site.ts';

describe('SEO site helpers', () => {
  test('canonical home is origin slash', () => {
    expect(canonicalUrl('/index.html')).toBe('https://nefisoft.com/');
  });

  test('legal pages are public catalog entries', () => {
    expect(isPublicHtmlPath('/legal/kvkk-politika.html')).toBe(true);
    expect(isPublicHtmlPath('/dashboard.html')).toBe(false);
  });

  test('normalizeHtmlPath maps legal filenames', () => {
    expect(normalizeHtmlPath('/legal/kvkk-politika.html', 'C:/dev/teklifbul-web/legal/kvkk-politika.html'))
      .toBe('/legal/kvkk-politika.html');
  });

  test('normalizeHtmlPath uses filename when path is empty', () => {
    expect(normalizeHtmlPath('', 'C:/dev/teklifbul-web/dashboard.html')).toBe('/dashboard.html');
  });

  test('robots.txt points at nefisoft.com sitemap and blocks app pages', () => {
    const robots = buildRobotsTxt();
    expect(robots).toContain('Sitemap: https://nefisoft.com/sitemap.xml');
    expect(robots).not.toContain('teklifbul.com');
    expect(robots).toContain('Disallow: /dashboard.html');
    expect(robots).toContain('Disallow: /pages/');
  });

  test('sitemap lists only indexable public urls', () => {
    const xml = buildSitemapXml('2026-08-16');
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('<loc>https://nefisoft.com/</loc>');
    expect(xml).toContain('<loc>https://nefisoft.com/contact.html</loc>');
    expect(xml).toContain('<loc>https://nefisoft.com/legal.html</loc>');
    expect(xml).toContain('<loc>https://nefisoft.com/legal/cerez-politikasi.html</loc>');
    expect(xml).not.toContain('dashboard.html');
    expect(xml).not.toContain('login.html');
    expect(xml).not.toContain('signup.html');
    expect(xml).not.toContain('forum.html');
    expect(xml).not.toContain('kvkk-aydinlatma.html');
    expect(shouldIncludeInSitemap(getPublicPageSeo('/forum.html'))).toBe(false);
    expect(shouldIncludeInSitemap(getPublicPageSeo('/legal/kvkk-aydinlatma.html'))).toBe(false);
  });

  test('auth and draft legal pages are noindex', () => {
    expect(getPublicPageSeo('/login.html')?.robots).toBe('noindex, nofollow');
    expect(getPublicPageSeo('/signup.html')?.robots).toBe('noindex, nofollow');
    expect(getPublicPageSeo('/legal/kvkk-aydinlatma.html')?.robots).toBe('noindex, nofollow');
    expect(getPublicPageSeo('/index.html')?.robots).toBe('index, follow');
  });
});
