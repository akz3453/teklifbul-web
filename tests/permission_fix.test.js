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
        // Setup Admin A (Member of Company A)
        adminA = testEnv.authenticatedContext('admin-a');
        await setDoc(doc(adminA.firestore(), 'users', 'admin-a'), {
            companyId: companyA,
            companyRole: 'buyer:genel_mudur',
            email: 'admina@test.com'
        });

        // Setup Member A (Member of Company A)
        memberA = testEnv.authenticatedContext('member-a');
        await setDoc(doc(memberA.firestore(), 'users', 'member-a'), {
            companyId: companyA,
            companyRole: 'buyer:satinalma_uzmani',
            email: 'membera@test.com'
        });

        // Setup Member B (Member of Company B)
        memberB = testEnv.authenticatedContext('member-b');
        await setDoc(doc(memberB.firestore(), 'users', 'member-b'), {
            companyId: companyB,
            companyRole: 'buyer:satinalma_uzmani',
            email: 'memberb@test.com'
        });
    });

    test('Member A should be able to read join request for Company A', async () => {
        const requestId = 'request-for-a';
        const requestRef = doc(adminA.firestore(), 'companyJoinRequests', requestId);

        // Create request (Admin context or same user can create)
        await setDoc(requestRef, {
            companyId: companyA,
            userId: 'applicant-1',
            status: 'pending'
        });

        // Member A (different user, same company) should be able to read
        const memberARef = doc(memberA.firestore(), 'companyJoinRequests', requestId);
        await assertSucceeds(getDoc(memberARef));
    });

    test('Member B should NOT be able to read join request for Company A', async () => {
        const requestId = 'request-for-a';
        const memberBRef = doc(memberB.firestore(), 'companyJoinRequests', requestId);

        await assertFails(getDoc(memberBRef));
    });

    test('Member A should be able to update join request for Company A', async () => {
        const requestId = 'request-for-a';
        const memberARef = doc(memberA.firestore(), 'companyJoinRequests', requestId);

        await assertSucceeds(updateDoc(memberARef, {
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
