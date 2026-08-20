import { describe, expect, test } from 'vitest';
import {
  buildAcceptedLegalConsent,
  getLegalCatalog,
  isLegalDocumentPublished,
} from '../assets/js/utils/legal-consent.js';

describe('legal consent versioning', () => {
  test('catalog documents are draft until counsel publishes', () => {
    const catalog = getLegalCatalog();
    expect(catalog.policyVersion).toContain('draft');
    expect(isLegalDocumentPublished('kvkk-aydinlatma')).toBe(false);
    expect(isLegalDocumentPublished('alici-sozlesme')).toBe(false);
  });

  test('consent record binds document version and keeps draft status', () => {
    const consent = buildAcceptedLegalConsent(['kvkk-aydinlatma', 'alici-sozlesme']);
    expect(consent.allDraft).toBe(true);
    expect(consent.documents['kvkk-aydinlatma'].status).toBe('draft');
    expect(consent.documents['kvkk-aydinlatma'].version).toBeTruthy();
    expect(consent.documents['kvkk-aydinlatma'].path).toContain('/legal/');
    expect(JSON.stringify(consent)).not.toMatch(/approved|yayınlandı|onaylandı/i);
  });
});
