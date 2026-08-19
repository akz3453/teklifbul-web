/**
 * Teklifbul Rule v1.0 — Güvenlik projeksiyon backfill
 *
 * 1) publicProfiles: aktif tedarikçiler (PII yok)
 * 2) companyJoinStatus: gerçek şirket id'si var, status boş → accepted
 * 3) companies/{id}/members/{uid}: accepted üye, members dokümanı yoksa SoT
 *
 * Kullanım:
 *   node scripts/backfill-security-projections.js
 *   node scripts/backfill-security-projections.js --apply
 */

import admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const logger = {
  group(title) {
    console.groupCollapsed(`🧭 ${title}`);
  },
  info(msg, data) {
    console.info('ℹ️', msg, data || '');
  },
  warn(msg, data) {
    console.warn('⚠️', msg, data || '');
  },
  error(msg, err) {
    console.error('❌', msg, err || '');
  },
  end() {
    console.groupEnd();
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 400;

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

function isSoloOrEmpty(cid) {
  return !cid || typeof cid !== 'string' || cid.startsWith('solo-');
}

function isSupplierUser(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.isSupplier === true) return true;
  const roles = data.roles;
  if (Array.isArray(roles) && roles.includes('supplier')) return true;
  if (roles && typeof roles === 'object' && roles.supplier === true) return true;
  return false;
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.length > 0);
}

function buildPublicProfile(uid, userData) {
  if (!isSupplierUser(userData) || userData.isActive === false) return null;
  const displayName = String(
    userData.displayName || userData.name || userData.companyName || ''
  ).trim();
  const companyName = String(userData.companyName || userData.displayName || '').trim();
  const rawCompanyId = userData.companyId || userData.activeCompanyId;
  const companyId = isSoloOrEmpty(rawCompanyId) ? null : rawCompanyId;
  return {
    displayName: displayName || companyName || 'Tedarikçi',
    companyName: companyName || displayName || 'Tedarikçi',
    isSupplier: true,
    isActive: true,
    companyId,
    supplierCategoryIds: asStringList(userData.supplierCategoryIds),
    photoURL: typeof userData.photoURL === 'string' ? userData.photoURL : null,
    updatedAt: FieldValue.serverTimestamp(),
    backfilledFrom: uid,
  };
}

async function commitBatch(ops) {
  if (!APPLY || ops.length === 0) return;
  const batch = db.batch();
  for (const op of ops) {
    if (op.type === 'set') batch.set(op.ref, op.data);
    else if (op.type === 'update') batch.update(op.ref, op.data);
    else if (op.type === 'delete') batch.delete(op.ref);
  }
  await batch.commit();
}

async function run() {
  logger.group('Güvenlik projeksiyon backfill');
  logger.info(APPLY ? 'APPLY modu — yazılacak' : 'DRY-RUN — değişiklik yok, --apply ile yazın');

  const counts = {
    users: 0,
    profilesWritten: 0,
    profilesDeleted: 0,
    joinStatus: 0,
    members: 0,
  };

  let lastDoc = null;
  let pendingOps = [];

  const flush = async () => {
    if (pendingOps.length === 0) return;
    await commitBatch(pendingOps);
    pendingOps = [];
  };

  while (true) {
    let query = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    for (const userDoc of snap.docs) {
      counts.users += 1;
      const uid = userDoc.id;
      const data = userDoc.data() || {};
      const companyId = data.companyId || data.activeCompanyId || null;
      const joinStatus = typeof data.companyJoinStatus === 'string' ? data.companyJoinStatus : '';

      const profilePayload = buildPublicProfile(uid, data);
      const profileRef = db.collection('publicProfiles').doc(uid);
      if (profilePayload) {
        pendingOps.push({ type: 'set', ref: profileRef, data: profilePayload });
        counts.profilesWritten += 1;
      } else {
        const existing = await profileRef.get();
        if (existing.exists) {
          pendingOps.push({ type: 'delete', ref: profileRef });
          counts.profilesDeleted += 1;
        }
      }

      if (
        !isSoloOrEmpty(companyId) &&
        !['accepted', 'approved', 'pending', 'rejected'].includes(joinStatus)
      ) {
        pendingOps.push({
          type: 'update',
          ref: userDoc.ref,
          data: {
            companyJoinStatus: 'accepted',
            updatedAt: FieldValue.serverTimestamp(),
          },
        });
        counts.joinStatus += 1;
      }

      const effectiveJoin =
        ['accepted', 'approved'].includes(joinStatus) ||
        (!joinStatus && !isSoloOrEmpty(companyId));
      if (effectiveJoin && !isSoloOrEmpty(companyId)) {
        const memberRef = db.collection('companies').doc(companyId).collection('members').doc(uid);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists) {
          pendingOps.push({
            type: 'set',
            ref: memberRef,
            data: {
              userId: uid,
              status: 'accepted',
              backfilled: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
          });
          counts.members += 1;
        }
      }

      if (pendingOps.length >= 400) {
        await flush();
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  await flush();
  logger.info('Backfill özeti', { ...counts, apply: APPLY });
  logger.end();
}

run().catch((err) => {
  logger.error('Backfill hatası', err);
  process.exit(1);
});
