/**
 * Teklifbul Rule v1.0 — Markalı doğrulama maili ancak gerçek sağlayıcı varken
 */
import { afterEach, describe, expect, test } from 'vitest';
import { isBrandedEmailReady } from '../server/services/emailService.js';

const ORIGINAL = {
  SENDER_EMAIL: process.env.SENDER_EMAIL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  MAILJET_API_KEY: process.env.MAILJET_API_KEY,
  MAILJET_API_SECRET: process.env.MAILJET_API_SECRET,
};

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  restoreEnv('SENDER_EMAIL', ORIGINAL.SENDER_EMAIL);
  restoreEnv('RESEND_API_KEY', ORIGINAL.RESEND_API_KEY);
  restoreEnv('BREVO_API_KEY', ORIGINAL.BREVO_API_KEY);
  restoreEnv('MAILJET_API_KEY', ORIGINAL.MAILJET_API_KEY);
  restoreEnv('MAILJET_API_SECRET', ORIGINAL.MAILJET_API_SECRET);
});

describe('isBrandedEmailReady', () => {
  test('missing sender is not ready', () => {
    delete process.env.SENDER_EMAIL;
    delete process.env.RESEND_API_KEY;
    expect(isBrandedEmailReady()).toBe(false);
  });

  test('resend.dev sender is not ready', () => {
    process.env.SENDER_EMAIL = 'Nefisoft <onboarding@resend.dev>';
    process.env.RESEND_API_KEY = 're_test';
    expect(isBrandedEmailReady()).toBe(false);
  });

  test('real sender without provider keys is not ready', () => {
    process.env.SENDER_EMAIL = 'Nefisoft <noreply@nefisoft.com>';
    delete process.env.RESEND_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.MAILJET_API_KEY;
    delete process.env.MAILJET_API_SECRET;
    expect(isBrandedEmailReady()).toBe(false);
  });

  test('real sender with Resend key is ready', () => {
    process.env.SENDER_EMAIL = 'noreply@nefisoft.com';
    process.env.RESEND_API_KEY = 're_test';
    expect(isBrandedEmailReady()).toBe(true);
  });
});
