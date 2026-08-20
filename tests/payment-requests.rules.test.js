/**
 * paymentRequests isolation — B2B ödeme talebi (Premium checkout değil)
 * Teklifbul Rule v1.0
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

const COMPANY_A = 'tax-1111111111';
const COMPANY_B = 'tax-2222222222';
const USER_A = 'pay-user-a';
const TEAMMATE_A = 'pay-user-a2';
const USER_B = 'pay-user-b';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'teklifbul-payment-requests-rules',
    firestore: {
      rules: rulesContent,
      host: 'localhost',
      port: 8080
    }
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'companies', COMPANY_A), {
      ownerId: USER_A,
      planId: 'premium_monthly',
      isPremium: true,
    });
    await setDoc(doc(db, 'companies', COMPANY_B), {
      ownerId: USER_B,
      planId: 'premium_monthly',
      isPremium: true,
    });
    await setDoc(doc(db, 'users', USER_A), {
      email: 'a@test.com',
      companyId: COMPANY_A,
      activeCompanyId: COMPANY_A,
      companies: [COMPANY_A],
      companyJoinStatus: 'accepted',
    });
    await setDoc(doc(db, 'users', TEAMMATE_A), {
      email: 'a2@test.com',
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
    await setDoc(doc(db, 'companies', COMPANY_A, 'members', TEAMMATE_A), {
      userId: TEAMMATE_A,
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

describe('paymentRequests', () => {
  test('requester kendi pending talebini oluşturabilir', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    const ref = doc(ctx.firestore(), 'paymentRequests', 'pr-create-ok');
    await assertSucceeds(setDoc(ref, {
      requesterUserId: USER_A,
      companyId: COMPANY_A,
      status: 'pending',
      amount: 100,
    }));
  });

  test('başkasının requesterUserId ile create edilemez', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    const ref = doc(ctx.firestore(), 'paymentRequests', 'pr-spoof-requester');
    await assertFails(setDoc(ref, {
      requesterUserId: USER_B,
      companyId: COMPANY_A,
      status: 'pending',
    }));
  });

  test('create status paid/approved olamaz', async () => {
    const ctx = testEnv.authenticatedContext(USER_A);
    const ref = doc(ctx.firestore(), 'paymentRequests', 'pr-bad-status');
    await assertFails(setDoc(ref, {
      requesterUserId: USER_A,
      companyId: COMPANY_A,
      status: 'paid',
    }));
  });

  test('requester ve aynı şirket üyesi okuyabilir, yabancı şirket okuyamaz', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'paymentRequests', 'pr-read'), {
        requesterUserId: USER_A,
        companyId: COMPANY_A,
        status: 'pending',
      });
    });
    const owner = testEnv.authenticatedContext(USER_A);
    const teammate = testEnv.authenticatedContext(TEAMMATE_A);
    const other = testEnv.authenticatedContext(USER_B);
    await assertSucceeds(getDoc(doc(owner.firestore(), 'paymentRequests', 'pr-read')));
    await assertSucceeds(getDoc(doc(teammate.firestore(), 'paymentRequests', 'pr-read')));
    await assertFails(getDoc(doc(other.firestore(), 'paymentRequests', 'pr-read')));
  });

  test('requester pending talebi cancelled yapabilir, paid yapamaz', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'paymentRequests', 'pr-cancel'), {
        requesterUserId: USER_A,
        companyId: COMPANY_A,
        status: 'pending',
      });
    });
    const ctx = testEnv.authenticatedContext(USER_A);
    const ref = doc(ctx.firestore(), 'paymentRequests', 'pr-cancel');
    await assertSucceeds(updateDoc(ref, { status: 'cancelled' }));

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'paymentRequests', 'pr-paid-lock'), {
        requesterUserId: USER_A,
        companyId: COMPANY_A,
        status: 'pending',
      });
    });
    const paidRef = doc(ctx.firestore(), 'paymentRequests', 'pr-paid-lock');
    await assertFails(updateDoc(paidRef, { status: 'paid' }));
  });

  test('requester pending silebilir, yabancı silemez', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'paymentRequests', 'pr-del-owner'), {
        requesterUserId: USER_A,
        companyId: COMPANY_A,
        status: 'pending',
      });
      await setDoc(doc(ctx.firestore(), 'paymentRequests', 'pr-del-other'), {
        requesterUserId: USER_A,
        companyId: COMPANY_A,
        status: 'pending',
      });
    });
    const owner = testEnv.authenticatedContext(USER_A);
    const other = testEnv.authenticatedContext(USER_B);
    await assertFails(deleteDoc(doc(other.firestore(), 'paymentRequests', 'pr-del-other')));
    await assertSucceeds(deleteDoc(doc(owner.firestore(), 'paymentRequests', 'pr-del-owner')));
  });
});
