import { describe, expect, test } from 'vitest';
import { sanitizeEventParams } from '../assets/js/analytics-params.js';
import { FIREBASE_WEB_MEASUREMENT_ID, resolveMeasurementId } from '../assets/js/analytics-id.js';

describe('analytics param sanitizer', () => {
  test('drops email phone uid and tokens', () => {
    const out = sanitizeEventParams({
      method: 'password',
      email: 'a@b.com',
      phone: '05551112233',
      uid: 'abc',
      userId: 'abc',
      token: 'secret',
    });
    expect(out).toEqual({ method: 'password' });
  });

  test('drops values that look like email', () => {
    const out = sanitizeEventParams({ note: 'user@example.com', status: 'draft' });
    expect(out).toEqual({ status: 'draft' });
  });
});

describe('GA measurement id', () => {
  test('uses Firebase web measurement id in production when env empty', () => {
    expect(resolveMeasurementId({ PROD: true })).toBe(FIREBASE_WEB_MEASUREMENT_ID);
  });

  test('stays silent in development without env', () => {
    expect(resolveMeasurementId({ PROD: false })).toBe('');
  });

  test('env overrides production fallback', () => {
    expect(resolveMeasurementId({ PROD: true, VITE_GA_MEASUREMENT_ID: 'G-OVERRIDE1' })).toBe('G-OVERRIDE1');
  });
});
