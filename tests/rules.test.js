/**
 * Firestore Rules Tests for Stocks Collection
 * Teklifbul Rule v1.0 - Firestore autocomplete: Company isolation tests
 */

import { describe, test, beforeAll, afterAll } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load actual firestore.rules file
const rulesContent = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf8');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'test-project',
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

describe('Stocks Collection - Company Isolation', () => {
  let userA, userB;
  let companyC1 = 'company-c1';
  let companyC2 = 'company-c2';
  
  beforeAll(async () => {
    // Create test users with company assignments
    userA = testEnv.authenticatedContext('user-a');
    userB = testEnv.authenticatedContext('user-b');
    
    // Seed user documents with companyId
    const userADoc = doc(userA.firestore(), 'users', 'user-a');
    const userBDoc = doc(userB.firestore(), 'users', 'user-b');
    
    await setDoc(userADoc, { companyId: companyC1, email: 'usera@test.com' });
    await setDoc(userBDoc, { companyId: companyC2, email: 'userb@test.com' });
  });
  
  describe('Read Access', () => {
    test('User A should be able to read stock with companyId=C1', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'stock-c1-1');
      await setDoc(stockRef, {
        companyId: companyC1,
        name: 'Test Stock C1',
        sku: 'SKU-C1-1',
        searchTokens: ['test', 'stock']
      });
      
      await assertSucceeds(getDoc(stockRef));
    });
    
    test('User A should NOT be able to read stock with companyId=C2', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'stock-c2-1');
      await setDoc(stockRef, {
        companyId: companyC2,
        name: 'Test Stock C2',
        sku: 'SKU-C2-1',
        searchTokens: ['test', 'stock']
      });
      
      await assertFails(getDoc(stockRef));
    });
    
    test('User B should be able to read stock with companyId=C2', async () => {
      const stockRef = doc(userB.firestore(), 'stocks', 'stock-c2-2');
      await setDoc(stockRef, {
        companyId: companyC2,
        name: 'Test Stock C2-2',
        sku: 'SKU-C2-2',
        searchTokens: ['test']
      });
      
      await assertSucceeds(getDoc(stockRef));
    });
  });
  
  describe('Create Access', () => {
    test('User A should be able to create stock with companyId=C1', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'new-stock-c1');
      
      await assertSucceeds(setDoc(stockRef, {
        companyId: companyC1,
        name: 'New Stock C1',
        sku: 'NEW-C1',
        searchTokens: ['new', 'stock']
      }));
    });
    
    test('User A should NOT be able to create stock with companyId=C2', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'new-stock-c2');
      
      await assertFails(setDoc(stockRef, {
        companyId: companyC2,
        name: 'New Stock C2',
        sku: 'NEW-C2',
        searchTokens: ['new']
      }));
    });
  });
  
  describe('Update Access', () => {
    test('User A should be able to update normal fields (name) in their company stock', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'update-test-c1');
      await setDoc(stockRef, {
        companyId: companyC1,
        name: 'Original Name',
        sku: 'UPDATE-C1',
        searchTokens: ['original']
      });
      
      await assertSucceeds(updateDoc(stockRef, {
        name: 'Updated Name'
      }));
    });
    
    test('User A should NOT be able to change companyId', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'change-company-test');
      await setDoc(stockRef, {
        companyId: companyC1,
        name: 'Test Stock',
        sku: 'TEST-1',
        searchTokens: ['test']
      });
      
      await assertFails(updateDoc(stockRef, {
        companyId: companyC2
      }));
    });
    
    test('User A should NOT be able to change searchTokens field', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'change-tokens-test');
      await setDoc(stockRef, {
        companyId: companyC1,
        name: 'Test Stock',
        sku: 'TEST-2',
        searchTokens: ['original', 'tokens']
      });
      
      await assertFails(updateDoc(stockRef, {
        searchTokens: ['hacked', 'tokens']
      }));
    });
    
    test('User A should NOT be able to update stock from different company', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'stock-c2-update');
      // Create stock with C2 (using admin context to bypass rules)
      const adminContext = testEnv.unauthenticatedContext();
      await setDoc(doc(adminContext.firestore(), 'stocks', 'stock-c2-update'), {
        companyId: companyC2,
        name: 'C2 Stock',
        sku: 'C2-1',
        searchTokens: ['c2']
      });
      
      // User A should not be able to update
      await assertFails(updateDoc(stockRef, {
        name: 'Hacked Name'
      }));
    });
  });
  
  describe('Delete Access', () => {
    test('User A should be able to delete stock from their company', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'delete-test-c1');
      await setDoc(stockRef, {
        companyId: companyC1,
        name: 'Delete Test',
        sku: 'DEL-C1',
        searchTokens: ['delete']
      });
      
      await assertSucceeds(deleteDoc(stockRef));
    });
    
    test('User A should NOT be able to delete stock from different company', async () => {
      const stockRef = doc(userA.firestore(), 'stocks', 'delete-test-c2');
      // Create stock with C2 (using admin context)
      const adminContext = testEnv.unauthenticatedContext();
      await setDoc(doc(adminContext.firestore(), 'stocks', 'delete-test-c2'), {
        companyId: companyC2,
        name: 'C2 Delete Test',
        sku: 'DEL-C2',
        searchTokens: ['delete']
      });
      
      await assertFails(deleteDoc(stockRef));
    });
  });
});

