/**
 * Teklifbul Rule v1.0 — Native güvenlik kuralları: emailVerified kilidi + userTokens
 */
import { describe, test, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rulesContent = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'teklifbul-mobile-rules',
    firestore: {
      rules: rulesContent,
      host: 'localhost',
      port: 8080
    }
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('users.emailVerified lock', () => {
  test('kullanıcı create sırasında emailVerified: true yazamaz', async () => {
    const ctx = testEnv.authenticatedContext('user-ev-create');
    const ref = doc(ctx.firestore(), 'users', 'user-ev-create');
    await assertFails(setDoc(ref, {
      email: 'a@test.com',
      emailVerified: true
    }));
  });

  test('kullanıcı emailVerified olmadan kendi profilini oluşturabilir', async () => {
    const ctx = testEnv.authenticatedContext('user-ev-ok');
    const ref = doc(ctx.firestore(), 'users', 'user-ev-ok');
    await assertSucceeds(setDoc(ref, {
      email: 'b@test.com'
    }));
  });

  test('kurulu şirket profilinde emailVerified güncellenemez', async () => {
    const uid = 'user-ev-locked';
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'users', uid), {
        email: 'c@test.com',
        companyId: 'tax-0450650024',
        emailVerified: false
      });
    });
    const ctx = testEnv.authenticatedContext(uid);
    const ref = doc(ctx.firestore(), 'users', uid);
    await assertFails(updateDoc(ref, { emailVerified: true }));
    await assertSucceeds(updateDoc(ref, { displayName: 'Test' }));
  });
});

describe('userTokens owner-only', () => {
  test('sahip kendi token belgesini yazabilir', async () => {
    const ctx = testEnv.authenticatedContext('push-owner');
    const ref = doc(ctx.firestore(), 'userTokens', 'push-owner', 'tokens', 'tok-1');
    await assertSucceeds(setDoc(ref, {
      token: 'tok-1',
      userId: 'push-owner',
      platform: 'android'
    }));
    await assertSucceeds(getDoc(ref));
  });

  test('başka kullanıcı token yazamaz / okuyamaz', async () => {
    const owner = testEnv.authenticatedContext('push-owner-2');
    const other = testEnv.authenticatedContext('push-other');
    const refPath = ['userTokens', 'push-owner-2', 'tokens', 'tok-2'];
    await assertSucceeds(setDoc(doc(owner.firestore(), ...refPath), {
      token: 'tok-2',
      userId: 'push-owner-2',
      platform: 'android'
    }));
    await assertFails(getDoc(doc(other.firestore(), ...refPath)));
    await assertFails(setDoc(doc(other.firestore(), ...refPath), {
      token: 'hijack',
      userId: 'push-owner-2',
      platform: 'android'
    }));
  });

  test('sahip kendi token belgesini silebilir, başkası silemez', async () => {
    const owner = testEnv.authenticatedContext('push-del-owner');
    const other = testEnv.authenticatedContext('push-del-other');
    const refPath = ['userTokens', 'push-del-owner', 'tokens', 'tok-del'];
    await assertSucceeds(setDoc(doc(owner.firestore(), ...refPath), {
      token: 'tok-del',
      userId: 'push-del-owner',
      platform: 'android'
    }));
    await assertFails(deleteDoc(doc(other.firestore(), ...refPath)));
    await assertSucceeds(deleteDoc(doc(owner.firestore(), ...refPath)));
  });
});
