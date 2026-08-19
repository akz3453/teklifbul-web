/**
 * Teklifbul Rule v1.0 — sandbox checkout must not be the production default
 */
import { afterEach, describe, expect, test } from 'vitest';
import { isMockPurchaseEnabled, resolveCheckoutBaseUrl } from '../server/services/paymentsService.js';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  PAYMENT_CHECKOUT_BASE_URL: process.env.PAYMENT_CHECKOUT_BASE_URL,
  ALLOW_MOCK_AI_PURCHASES: process.env.ALLOW_MOCK_AI_PURCHASES,
  K_SERVICE: process.env.K_SERVICE,
};

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  if (ORIGINAL_ENV.PAYMENT_CHECKOUT_BASE_URL === undefined) {
    delete process.env.PAYMENT_CHECKOUT_BASE_URL;
  } else {
    process.env.PAYMENT_CHECKOUT_BASE_URL = ORIGINAL_ENV.PAYMENT_CHECKOUT_BASE_URL;
  }
  if (ORIGINAL_ENV.ALLOW_MOCK_AI_PURCHASES === undefined) {
    delete process.env.ALLOW_MOCK_AI_PURCHASES;
  } else {
    process.env.ALLOW_MOCK_AI_PURCHASES = ORIGINAL_ENV.ALLOW_MOCK_AI_PURCHASES;
  }
  if (ORIGINAL_ENV.K_SERVICE === undefined) delete process.env.K_SERVICE;
  else process.env.K_SERVICE = ORIGINAL_ENV.K_SERVICE;
});

describe('checkout / mock purchase guards', () => {
  test('production without PAYMENT_CHECKOUT_BASE_URL throws', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PAYMENT_CHECKOUT_BASE_URL;
    expect(() => resolveCheckoutBaseUrl()).toThrow(/henüz aktif değil/);
  });

  test('production sandbox checkout URL is rejected', () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_CHECKOUT_BASE_URL = 'https://pay.teklifbul-sandbox.local/checkout';
    expect(() => resolveCheckoutBaseUrl()).toThrow(/henüz aktif değil/);
  });

  test('Cloud Run (K_SERVICE) without checkout URL throws', () => {
    process.env.K_SERVICE = 'api';
    process.env.NODE_ENV = 'development';
    delete process.env.PAYMENT_CHECKOUT_BASE_URL;
    expect(() => resolveCheckoutBaseUrl()).toThrow(/henüz aktif değil/);
  });

  test('development may use sandbox default', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.PAYMENT_CHECKOUT_BASE_URL;
    expect(resolveCheckoutBaseUrl()).toContain('teklifbul-sandbox.local');
  });

  test('mock purchases are disabled in production even if env is true', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_MOCK_AI_PURCHASES = 'true';
    expect(isMockPurchaseEnabled()).toBe(false);
  });
});
