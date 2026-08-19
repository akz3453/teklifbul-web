import { describe, test, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rulesContent = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

let testEnv;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'test-project-permissions',
        firestore: {
            rules: rulesContent,
            host: 'localhost',
            port: 8080
        }
    });
});

afterAll(async () => {
    await testEnv.cleanup();
});

describe('Company Join Requests Permissions', () => {
    let adminA, memberA, memberB;
    const companyA = 'company-a';
    const companyB = 'company-b';

    beforeAll(async () => {
        adminA = testEnv.authenticatedContext('admin-a');
        memberA = testEnv.authenticatedContext('member-a');
        memberB = testEnv.authenticatedContext('member-b');

        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            const db = ctx.firestore();
            await setDoc(doc(db, 'companies', companyA), {
                ownerId: 'admin-a',
                name: 'A',
            });
            await setDoc(doc(db, 'companies', companyB), {
                ownerId: 'member-b',
                name: 'B',
            });
            await setDoc(doc(db, 'users', 'admin-a'), {
                companyId: companyA,
                companyRole: 'buyer:genel_mudur',
                companyJoinStatus: 'accepted',
                email: 'admina@test.com',
            });
            await setDoc(doc(db, 'users', 'member-a'), {
                companyId: companyA,
                companyRole: 'buyer:satinalma_uzmani',
                companyJoinStatus: 'accepted',
                email: 'membera@test.com',
            });
            await setDoc(doc(db, 'users', 'member-b'), {
                companyId: companyB,
                companyRole: 'buyer:satinalma_uzmani',
                companyJoinStatus: 'accepted',
                email: 'memberb@test.com',
            });
        });
    });

    test('Owner A should be able to read join request for Company A', async () => {
        const requestId = 'request-for-a';
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'companyJoinRequests', requestId), {
                companyId: companyA,
                userId: 'applicant-1',
                status: 'pending'
            });
        });

        const requestRef = doc(adminA.firestore(), 'companyJoinRequests', requestId);
        await assertSucceeds(getDoc(requestRef));
    });

    test('Member A (non-owner) should NOT be able to read join request for Company A', async () => {
        const requestId = 'request-for-a';
        const memberARef = doc(memberA.firestore(), 'companyJoinRequests', requestId);
        await assertFails(getDoc(memberARef));
    });

    test('Member B should NOT be able to read join request for Company A', async () => {
        const requestId = 'request-for-a';
        const memberBRef = doc(memberB.firestore(), 'companyJoinRequests', requestId);

        await assertFails(getDoc(memberBRef));
    });

    test('Owner A should be able to update join request for Company A', async () => {
        const requestId = 'request-for-a';
        const ownerRef = doc(adminA.firestore(), 'companyJoinRequests', requestId);

        await assertSucceeds(updateDoc(ownerRef, {
            status: 'approved'
        }));
    });

    test('Member A (non-owner) should NOT be able to update join request for Company A', async () => {
        const requestId = 'request-for-a';
        const memberARef = doc(memberA.firestore(), 'companyJoinRequests', requestId);

        await assertFails(updateDoc(memberARef, {
            status: 'approved'
        }));
    });

    test('Member B should NOT be able to update join request for Company A', async () => {
        const requestId = 'request-for-a';
        const memberBRef = doc(memberB.firestore(), 'companyJoinRequests', requestId);

        await assertFails(updateDoc(memberBRef, {
            status: 'approved'
        }));
    });
});
