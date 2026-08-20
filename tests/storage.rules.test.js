/**
 * Storage rules — company-logos / company-gallery
 * Locks CURRENT policy: any signed-in user may read; only accepted members write.
 * Tightening read is a product decision, not covered here.
 * Teklifbul Rule v1.0
 */
import { describe, test, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const firestoreRules = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');
const storageRules = readFileSync(join(__dirname, '..', 'storage.rules'), 'utf8');

const COMPANY_A = 'tax-1111111111';
const COMPANY_B = 'tax-2222222222';
const USER_A = 'stor-user-a';
const USER_B = 'stor-user-b';
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'teklifbul',
    firestore: {
      rules: firestoreRules,
      host: '127.0.0.1',
      port: 8080
    },
    storage: {
      rules: storageRules,
      host: '127.0.0.1',
      port: 9199
    }
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', USER_A), {
      email: 'a@test.com',
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
    });
    await setDoc(doc(db, 'users', USER_B), {
      email: 'b@test.com',
      companyId: COMPANY_B,
      activeCompanyId: COMPANY_B,
      companies: [COMPANY_B],
      companyJoinStatus: 'accepted',
    });
    await setDoc(doc(db, 'companies', COMPANY_A, 'members', USER_A), {
      userId: USER_A,
      status: 'accepted',
    });
    await setDoc(doc(db, 'companies', COMPANY_B, 'members', USER_B), {
      userId: USER_B,
      status: 'accepted',
    });
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('storage company-logos / company-gallery', () => {
  test('üye kendi şirket logosunu yükleyebilir', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    const logoRef = ref(ctx.storage(), `company-logos/${COMPANY_A}/logo.png`);
    await assertSucceeds(uploadBytes(logoRef, PNG_BYTES, { contentType: 'image/png' }));
  });

  test('yabancı şirket logosuna yazamaz', async () => {
    const ctx = testEnv.authenticatedContext(USER_B);
    const logoRef = ref(ctx.storage(), `company-logos/${COMPANY_A}/hijack.png`);
    await assertFails(uploadBytes(logoRef, PNG_BYTES, { contentType: 'image/png' }));
  });

  test('giriş yapmış başka kullanıcı logoyu okuyabilir (mevcut politika)', async () => {
    const owner = testEnv.authenticatedContext(USER_A);
    const path = `company-logos/${COMPANY_A}/public-read.png`;
    await assertSucceeds(uploadBytes(ref(owner.storage(), path), PNG_BYTES, { contentType: 'image/png' }));
    const other = testEnv.authenticatedContext(USER_B);
    await assertSucceeds(getBytes(ref(other.storage(), path)));
  });

  test('anonim logo okuyamaz', async () => {
    const owner = testEnv.authenticatedContext(USER_A);
    const path = `company-logos/${COMPANY_A}/anon-deny.png`;
    await assertSucceeds(uploadBytes(ref(owner.storage(), path), PNG_BYTES, { contentType: 'image/png' }));
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getBytes(ref(anon.storage(), path)));
  });

  test('üye galeriye image yükleyebilir, text yükleyemez', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    const galleryRef = ref(ctx.storage(), `company-gallery/${COMPANY_A}/shot.webp`);
    await assertSucceeds(uploadBytes(galleryRef, PNG_BYTES, { contentType: 'image/webp' }));
    const badRef = ref(ctx.storage(), `company-gallery/${COMPANY_A}/notes.txt`);
    await assertFails(uploadBytes(badRef, PNG_BYTES, { contentType: 'text/plain' }));
  });

  test('üye kendi şirket görselini silebilir, yabancı silemez', async () => {
    const owner = testEnv.authenticatedContext(USER_A);
    const path = `company-gallery/${COMPANY_A}/to-delete.png`;
    await assertSucceeds(uploadBytes(ref(owner.storage(), path), PNG_BYTES, { contentType: 'image/png' }));
    const other = testEnv.authenticatedContext(USER_B);
    await assertFails(deleteObject(ref(other.storage(), path)));
    await assertSucceeds(deleteObject(ref(owner.storage(), path)));
  });
});
