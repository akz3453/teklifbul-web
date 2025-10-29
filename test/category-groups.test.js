/**
 * Category Groups Tests
 * Tests for user category groups functionality
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, setDoc, getDoc } from 'firebase/firestore';

let testEnv;
let alice, bob;

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
            
            function isSelf(uid) {
              return request.auth != null && request.auth.uid == uid;
            }
            
            match /users/{uid} {
              allow read, write: if isSelf(uid);
            }
            
            match /users/{uid}/categoryGroups/{groupId} {
              allow read, create, update, delete: if isSignedIn() && request.auth.uid == uid;
            }
          }
        }
      `
    }
  });
  
  alice = testEnv.authenticatedContext('alice');
  bob = testEnv.authenticatedContext('bob');
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Category Groups Security Rules', () => {
  test('should allow user to create their own category group', async () => {
    const groupData = {
      name: 'Test Group',
      categories: ['elektrik', 'mobilya'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'test-group');
    await assertSucceeds(setDoc(groupRef, groupData));
  });

  test('should prevent user from accessing another user\'s category groups', async () => {
    const groupData = {
      name: 'Alice Group',
      categories: ['elektrik'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Alice creates a group
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'alice-group');
    await setDoc(groupRef, groupData);
    
    // Bob tries to read Alice's group
    const bobGroupRef = doc(bob.firestore(), 'users', 'alice', 'categoryGroups', 'alice-group');
    await assertFails(getDoc(bobGroupRef));
  });

  test('should allow user to update their own category group', async () => {
    const groupData = {
      name: 'Test Group',
      categories: ['elektrik'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'update-test');
    await setDoc(groupRef, groupData);
    
    // Update the group
    await assertSucceeds(updateDoc(groupRef, {
      name: 'Updated Group',
      categories: ['elektrik', 'mobilya'],
      updatedAt: new Date()
    }));
  });

  test('should prevent user from updating another user\'s category group', async () => {
    const groupData = {
      name: 'Alice Group',
      categories: ['elektrik'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Alice creates a group
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'alice-group');
    await setDoc(groupRef, groupData);
    
    // Bob tries to update Alice's group
    const bobGroupRef = doc(bob.firestore(), 'users', 'alice', 'categoryGroups', 'alice-group');
    await assertFails(updateDoc(bobGroupRef, {
      name: 'Hacked Group',
      updatedAt: new Date()
    }));
  });

  test('should allow user to delete their own category group', async () => {
    const groupData = {
      name: 'Delete Test Group',
      categories: ['elektrik'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'delete-test');
    await setDoc(groupRef, groupData);
    
    // Delete the group
    await assertSucceeds(deleteDoc(groupRef));
  });

  test('should prevent user from deleting another user\'s category group', async () => {
    const groupData = {
      name: 'Alice Group',
      categories: ['elektrik'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Alice creates a group
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'alice-group');
    await setDoc(groupRef, groupData);
    
    // Bob tries to delete Alice's group
    const bobGroupRef = doc(bob.firestore(), 'users', 'alice', 'categoryGroups', 'alice-group');
    await assertFails(deleteDoc(bobGroupRef));
  });
});

describe('Category Groups Data Model', () => {
  test('should store categories as slugs', async () => {
    const groupData = {
      name: 'Slug Test Group',
      categories: ['Elektrik Kablo', 'Mobilya Ahşap', 'İnşaat Malzemeleri'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'slug-test');
    await setDoc(groupRef, groupData);
    
    const docSnap = await getDoc(groupRef);
    const data = docSnap.data();
    
    // Categories should be stored as slugs
    expect(data.categories).toEqual(['elektrik-kablo', 'mobilya-ahsap', 'insaat-malzemeleri']);
  });

  test('should require name field', async () => {
    const groupData = {
      categories: ['elektrik'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'no-name');
    await assertFails(setDoc(groupRef, groupData));
  });

  test('should require categories array', async () => {
    const groupData = {
      name: 'No Categories Group',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'no-categories');
    await assertFails(setDoc(groupRef, groupData));
  });
});

describe('Category Groups Integration', () => {
  test('should apply group categories to demand form', async () => {
    // This would be an integration test with the demand form
    // For now, we'll test the data structure
    
    const groupData = {
      name: 'Integration Test Group',
      categories: ['elektrik', 'mobilya', 'insaat'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const groupRef = doc(alice.firestore(), 'users', 'alice', 'categoryGroups', 'integration-test');
    await setDoc(groupRef, groupData);
    
    const docSnap = await getDoc(groupRef);
    const data = docSnap.data();
    
    expect(data.name).toBe('Integration Test Group');
    expect(data.categories).toHaveLength(3);
    expect(data.categories).toContain('elektrik');
    expect(data.categories).toContain('mobilya');
    expect(data.categories).toContain('insaat');
  });
});
