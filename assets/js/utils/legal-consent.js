// Teklifbul Rule v1.0 — Legal document version binding (no invented copy)
import LEGAL_VERSIONS from '../../../legal/legal-versions.json';

export function getLegalCatalog() {
  return LEGAL_VERSIONS;
}

export function getLegalDocumentMeta(docId) {
  return LEGAL_VERSIONS?.documents?.[docId] || null;
}

export function isLegalDocumentPublished(docId) {
  const meta = getLegalDocumentMeta(docId);
  return Boolean(meta && meta.status === 'published');
}

/**
 * Consent record stored on the user doc. status stays "draft" until counsel
 * publishes a version — never rewrite status to approved in code.
 * @param {string[]} docIds
 * @returns {{ documents: Record<string, object>, catalogPolicyVersion: string, allDraft: boolean, recordedAt: string }}
 */
export function buildAcceptedLegalConsent(docIds) {
  const recordedAt = new Date().toISOString();
  const documents = {};
  for (const id of docIds) {
    const meta = getLegalDocumentMeta(id);
    if (!meta) continue;
    documents[id] = {
      version: meta.version,
      status: meta.status,
      path: meta.path,
      acceptedAt: recordedAt,
    };
  }
  const statuses = Object.values(documents).map((item) => item.status);
  return {
    documents,
    catalogPolicyVersion: LEGAL_VERSIONS.policyVersion,
    allDraft: statuses.length > 0 && statuses.every((status) => status === 'draft'),
    recordedAt,
  };
}
