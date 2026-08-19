import { describe, expect, test } from 'vitest';
import { canTransitionInternalRequestStatus } from '../server/utils/internal-request-status.js';

describe('internal request status transitions', () => {
  test('SENT can be approved or rejected', () => {
    expect(canTransitionInternalRequestStatus('SENT', 'APPROVED')).toBe(true);
    expect(canTransitionInternalRequestStatus('SENT', 'REJECTED')).toBe(true);
  });

  test('DRAFT cannot skip to APPROVED', () => {
    expect(canTransitionInternalRequestStatus('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionInternalRequestStatus('DRAFT', 'REJECTED')).toBe(true);
  });

  test('APPROVED is terminal', () => {
    expect(canTransitionInternalRequestStatus('APPROVED', 'REJECTED')).toBe(false);
    expect(canTransitionInternalRequestStatus('APPROVED', 'SENT')).toBe(false);
  });
});
