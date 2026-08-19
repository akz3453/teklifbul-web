import { afterEach, describe, expect, test } from 'vitest';
import { handlePaymentWebhook } from '../server/services/paymentsService.js';

const ORIGINAL_SECRET = process.env.PAYMENT_WEBHOOK_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
  else process.env.PAYMENT_WEBHOOK_SECRET = ORIGINAL_SECRET;
});

describe('payment webhook guards', () => {
  test('missing secret rejects webhook (fail-closed)', async () => {
    const prev = process.env.PAYMENT_WEBHOOK_SECRET;
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const body = Buffer.from(JSON.stringify({
      type: 'payment.succeeded',
      data: { paymentIntentId: 'pi_test', userId: 'u1', planId: 'premium_monthly', amount: 1, currency: 'TRY' },
    }));
    await expect(handlePaymentWebhook(body, JSON.parse(body.toString()), 'deadbeef')).rejects.toThrow();
    if (prev === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
    else process.env.PAYMENT_WEBHOOK_SECRET = prev;
  });

  test('invalid signature rejects webhook', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'unit-test-secret';
    const body = Buffer.from(JSON.stringify({
      type: 'payment.succeeded',
      data: { paymentIntentId: 'pi_test', userId: 'u1', planId: 'premium_monthly', amount: 1, currency: 'TRY' },
    }));
    await expect(handlePaymentWebhook(body, JSON.parse(body.toString()), '0000')).rejects.toThrow(/imza/i);
  });
});
