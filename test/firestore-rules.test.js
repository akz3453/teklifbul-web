/**
 * Firestore Rules Tests
 * Tests for security rules and access control
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'test-project',
    firestore: {
      rules: `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            function isSignedIn() {
              return request.auth != null;
            }

            function isOwner(resource) {
              return isSignedIn() && resource.data.createdBy == request.auth.uid;
            }

            function isAdmin(uid) {
              return isSignedIn() && 
                get(/databases/$(database)/documents/users/$(uid)).data.role == 'admin';
            }

            function isMember(companyId, uid) {
              return isSignedIn() && 
                exists(/databases/$(database)/documents/companies/$(companyId)/memberships/$(uid));
            }

            function isPublic(d) {
              return d.isPublished == true && d.visibility == "public";
            }

            match /demands/{id} {
              allow read: if isSignedIn() && (
                isPublic(resource.data) ||
                isOwner(resource) ||
                (resource.data.companyId is string && isMember(resource.data.companyId, request.auth.uid)) ||
                isAdmin(request.auth.uid)
              );
              allow create: if isSignedIn();
              allow update: if (isOwner(resource) || isAdmin(request.auth.uid)) && 
                // SATFK is immutable after creation
                (request.resource.data.satfk == resource.data.satfk || resource.data.satfk == null);
              allow delete: if isOwner(resource) || isAdmin(request.auth.uid);
            }

            match /users/{uid} {
              allow read, write: if isSignedIn() && request.auth.uid == uid;
            }
          }
        }
      `,
      host: 'localhost',
      port: 8080
    }
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore Security Rules', () => {
  let alice, bob, admin;
  let aliceDemand, bobDemand, publicDemand;

  beforeAll(async () => {
    // Create test users
    alice = testEnv.authenticatedContext('alice');
    bob = testEnv.authenticatedContext('bob');
    admin = testEnv.authenticatedContext('admin', { role: 'admin' });

    // Create test demands
    aliceDemand = {
      title: 'Alice Private Demand',
      createdBy: 'alice',
      isPublished: false,
      visibility: 'private'
    };

    bobDemand = {
      title: 'Bob Private Demand',
      createdBy: 'bob',
      isPublished: false,
      visibility: 'private'
    };

    publicDemand = {
      title: 'Public Demand',
      createdBy: 'alice',
      isPublished: true,
      visibility: 'public'
    };
  });

  describe('Demand Access Control', () => {
    test('should allow owner to read their own private demand', async () => {
      const demandRef = doc(alice.firestore(), 'demands', 'alice-demand');
      await setDoc(demandRef, aliceDemand);

      await assertSucceeds(getDoc(demandRef));
    });

    test('should deny other users from reading private demands', async () => {
      const demandRef = doc(bob.firestore(), 'demands', 'alice-demand');
      await setDoc(demandRef, aliceDemand);

      await assertFails(getDoc(demandRef));
    });

    test('should allow any authenticated user to read public demands', async () => {
      const demandRef = doc(alice.firestore(), 'demands', 'public-demand');
      await setDoc(demandRef, publicDemand);

      // Alice should be able to read
      await assertSucceeds(getDoc(demandRef));

      // Bob should also be able to read
      const bobDemandRef = doc(bob.firestore(), 'demands', 'public-demand');
      await assertSucceeds(getDoc(bobDemandRef));
    });

    test('should allow admin to read any demand', async () => {
      const demandRef = doc(admin.firestore(), 'demands', 'bob-demand');
      await setDoc(demandRef, bobDemand);

      await assertSucceeds(getDoc(demandRef));
    });

    test('should allow owner to update their demand', async () => {
      const demandRef = doc(alice.firestore(), 'demands', 'alice-demand');
      await setDoc(demandRef, aliceDemand);

      await assertSucceeds(updateDoc(demandRef, { title: 'Updated Title' }));
    });

    test('should deny other users from updating demands they do not own', async () => {
      const demandRef = doc(bob.firestore(), 'demands', 'alice-demand');
      await setDoc(demandRef, aliceDemand);

      await assertFails(updateDoc(demandRef, { title: 'Hacked Title' }));
    });

    test('should allow admin to update any demand', async () => {
      const demandRef = doc(admin.firestore(), 'demands', 'bob-demand');
      await setDoc(demandRef, bobDemand);

      await assertSucceeds(updateDoc(demandRef, { title: 'Admin Updated Title' }));
    });

    test('should prevent changing SATFK after creation', async () => {
      const demandRef = doc(alice.firestore(), 'demands', 'alice-demand');
      const demandWithSATFK = {
        ...aliceDemand,
        satfk: 'SATFK-20251024-001'
      };
      
      await setDoc(demandRef, demandWithSATFK);

      // Should fail when trying to change SATFK
      await assertFails(updateDoc(demandRef, { satfk: 'SATFK-20251024-002' }));
    });

    test('should allow setting SATFK on new demand', async () => {
      const demandRef = doc(alice.firestore(), 'demands', 'new-demand');
      
      // Should succeed when setting SATFK for the first time
      await assertSucceeds(setDoc(demandRef, { 
        ...aliceDemand, 
        satfk: 'SATFK-20251024-001' 
      }));
    });
  });

  describe('User Access Control', () => {
    test('should allow users to read their own profile', async () => {
      const userRef = doc(alice.firestore(), 'users', 'alice');
      await setDoc(userRef, { name: 'Alice', email: 'alice@test.com' });

      await assertSucceeds(getDoc(userRef));
    });

    test('should deny users from reading other users profiles', async () => {
      const userRef = doc(bob.firestore(), 'users', 'alice');
      await setDoc(userRef, { name: 'Alice', email: 'alice@test.com' });

      await assertFails(getDoc(userRef));
    });
  });
});
