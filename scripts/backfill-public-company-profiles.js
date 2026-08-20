/**
 * Teklifbul Rule v1.0 — Idempotent publicCompanyProfiles backfill (PII-free).
 *
 * Default: dry-run. Does not delete companies.
 *
 *   node scripts/backfill-public-company-profiles.js
 *   node scripts/backfill-public-company-profiles.js --apply
 */

import admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const logger = {
  info(msg, data) {
    console.info('ℹ️', msg, data || '');
  },
  warn(msg, data) {
    console.warn('⚠️', msg, data || '');
  },
  error(msg, err) {
    console.error('❌', msg, err || '');
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 200;

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.length > 0);
}

function isTruthyFlag(data, key, roleKey) {
  if (data[key] === true) return true;
  const roles = data.roles;
  if (roleKey && roles && typeof roles === 'object' && !Array.isArray(roles)) {
    return roles[roleKey] === true;
  }
  return false;
}

function buildPublicCompanyProfilePayload(companyId, companyData, updatedAt) {
  if (!companyData) return null;
  const name = asString(companyData.name || companyData.companyName || companyData.title);
  const companyName = asString(companyData.companyName || companyData.name || companyData.title) || name;
  if (!name && !companyName) return null;
  const city = asString(companyData.city) || asString(companyData.addressParts?.city);
  return {
    companyId,
    name: name || companyName,
    companyName: companyName || name,
    logoUrl: asString(companyData.logoUrl) || null,
    about: asString(companyData.about) || null,
    website: asString(companyData.website) || null,
    city: city || null,
    isSupplier: isTruthyFlag(companyData, 'isSupplier', 'supplier'),
    isBuyer: isTruthyFlag(companyData, 'isBuyer', 'buyer'),
    isMarketplaceVisible: companyData.isMarketplaceVisible === true,
    supplierCategoryIds: asStringList(companyData.supplierCategoryIds),
    updatedAt,
  };
}

if (!admin.apps.length) {
  try {
    const serviceAccountPaths = [
      join(__dirname, '..', 'server', 'serviceAccountKey.json'),
      join(__dirname, '..', 'serviceAccountKey.json'),
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
    ].filter(Boolean);

    let credential = null;
    for (const keyPath of serviceAccountPaths) {
      if (keyPath && existsSync(keyPath)) {
        const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
        credential = admin.credential.cert(serviceAccount);
        logger.info('Service account key bulundu', { path: keyPath });
        break;
      }
    }
    if (!credential) {
      credential = admin.credential.applicationDefault();
      logger.warn('Application default credentials kullanılıyor');
    }
    admin.initializeApp({
      credential,
      projectId: 'teklifbul',
    });
  } catch (err) {
    logger.error('Firebase Admin initialization failed', err);
    process.exit(1);
  }
}

const db = admin.firestore();

async function run() {
  logger.info(APPLY ? 'APPLY mode' : 'DRY-RUN (no writes)');
  let last = null;
  let scanned = 0;
  let wouldWrite = 0;
  let written = 0;
  let skipped = 0;

  for (;;) {
    let q = db.collection('companies').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let batchOps = 0;

    for (const docSnap of snap.docs) {
      scanned += 1;
      const companyId = docSnap.id;
      if (!companyId || companyId.startsWith('solo-')) {
        skipped += 1;
        continue;
      }
      const payload = buildPublicCompanyProfilePayload(
        companyId,
        docSnap.data(),
        FieldValue.serverTimestamp()
      );
      if (!payload) {
        skipped += 1;
        continue;
      }
      wouldWrite += 1;
      if (APPLY) {
        batch.set(db.collection('publicCompanyProfiles').doc(companyId), payload, { merge: true });
        batchOps += 1;
      }
    }

    if (APPLY && batchOps > 0) {
      await batch.commit();
      written += batchOps;
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  logger.info('publicCompanyProfiles backfill summary', {
    scanned,
    wouldWrite,
    written,
    skipped,
    apply: APPLY,
  });
}

run().catch((err) => {
  logger.error('backfill failed', err);
  process.exit(1);
});
