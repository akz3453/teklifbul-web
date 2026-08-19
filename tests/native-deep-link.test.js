/**
 * Teklifbul Rule v1.0 — Native deep link allowlist
 */
import { describe, test, expect } from 'vitest';
import { isAllowedDeepLink, resolveDeepLinkPath } from '../assets/js/utils/native-deep-link.js';

describe('isAllowedDeepLink', () => {
  test('göreli yol kabul edilir', () => {
    expect(isAllowedDeepLink('/dashboard.html')).toBe(true);
  });

  test('protokol-relative reddedilir', () => {
    expect(isAllowedDeepLink('//evil.example/phish')).toBe(false);
  });

  test('güvenilir https host kabul edilir', () => {
    expect(isAllowedDeepLink('https://teklifbul.web.app/demands.html')).toBe(true);
  });

  test('yabancı host reddedilir', () => {
    expect(isAllowedDeepLink('https://evil.example/login.html')).toBe(false);
  });

  test('custom scheme kabul edilir', () => {
    expect(isAllowedDeepLink('com.nefisoft.app://auth')).toBe(true);
  });
});

describe('resolveDeepLinkPath', () => {
  test('https URL path + query döner', () => {
    expect(resolveDeepLinkPath('https://teklifbul.web.app/demand-detail.html?id=1')).toBe('/demand-detail.html?id=1');
  });

  test('yabancı URL null döner', () => {
    expect(resolveDeepLinkPath('https://evil.example/x')).toBe(null);
  });

  test('custom scheme redirect yoksa login', () => {
    expect(resolveDeepLinkPath('com.nefisoft.app://auth')).toBe('/login.html');
  });
});
