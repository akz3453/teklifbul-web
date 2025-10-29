/**
 * Suppliers Service Tests
 * Tests for supplier matching and category functionality
 */

import { findMatchingSuppliers, getActiveSuppliers, hasMatchingCategories } from '../assets/js/services/suppliers.js';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

describe('Suppliers Service', () => {
  let db;

  beforeAll(() => {
    db = global.firebaseDb;
  });

  beforeEach(async () => {
    await createTestSuppliers();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('findMatchingSuppliers', () => {
    test('should find suppliers with matching categories', async () => {
      const demandCategories = ['electronics', 'computers'];
      const suppliers = await findMatchingSuppliers(demandCategories, 10);
      
      expect(suppliers).toBeDefined();
      expect(Array.isArray(suppliers)).toBe(true);
      
      // All returned suppliers should have at least one matching category
      suppliers.forEach(supplier => {
        const hasMatch = demandCategories.some(category => 
          supplier.supplierCategories?.includes(category)
        );
        expect(hasMatch).toBe(true);
      });
    });

    test('should return empty array for no matching categories', async () => {
      const demandCategories = ['non-existent-category'];
      const suppliers = await findMatchingSuppliers(demandCategories, 10);
      
      expect(suppliers).toBeDefined();
      expect(Array.isArray(suppliers)).toBe(true);
      expect(suppliers.length).toBe(0);
    });

    test('should respect limit parameter', async () => {
      const demandCategories = ['electronics'];
      const suppliers = await findMatchingSuppliers(demandCategories, 2);
      
      expect(suppliers.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getActiveSuppliers', () => {
    test('should return only active suppliers', async () => {
      const suppliers = await getActiveSuppliers(10);
      
      expect(suppliers).toBeDefined();
      expect(Array.isArray(suppliers)).toBe(true);
      
      // All suppliers should be active
      suppliers.forEach(supplier => {
        expect(supplier.isActive).toBe(true);
        expect(supplier.isSupplier).toBe(true);
      });
    });

    test('should respect limit parameter', async () => {
      const suppliers = await getActiveSuppliers(3);
      expect(suppliers.length).toBeLessThanOrEqual(3);
    });
  });

  describe('hasMatchingCategories', () => {
    test('should return true for matching categories', () => {
      const supplier = {
        supplierCategories: ['electronics', 'computers', 'phones']
      };
      const categories = ['electronics', 'books'];
      
      expect(hasMatchingCategories(supplier, categories)).toBe(true);
    });

    test('should return false for no matching categories', () => {
      const supplier = {
        supplierCategories: ['electronics', 'computers']
      };
      const categories = ['books', 'clothing'];
      
      expect(hasMatchingCategories(supplier, categories)).toBe(false);
    });

    test('should handle empty supplier categories', () => {
      const supplier = {
        supplierCategories: []
      };
      const categories = ['electronics'];
      
      expect(hasMatchingCategories(supplier, categories)).toBe(false);
    });

    test('should handle null supplier categories', () => {
      const supplier = {};
      const categories = ['electronics'];
      
      expect(hasMatchingCategories(supplier, categories)).toBe(false);
    });
  });

  // Helper functions
  async function createTestSuppliers() {
    const testSuppliers = [
      {
        displayName: 'Electronics Supplier',
        email: 'electronics@test.com',
        isActive: true,
        isSupplier: true,
        supplierCategories: ['electronics', 'computers'],
        createdAt: new Date()
      },
      {
        displayName: 'Computer Supplier',
        email: 'computer@test.com',
        isActive: true,
        isSupplier: true,
        supplierCategories: ['computers', 'laptops'],
        createdAt: new Date()
      },
      {
        displayName: 'Book Supplier',
        email: 'books@test.com',
        isActive: true,
        isSupplier: true,
        supplierCategories: ['books', 'education'],
        createdAt: new Date()
      },
      {
        displayName: 'Inactive Supplier',
        email: 'inactive@test.com',
        isActive: false,
        isSupplier: true,
        supplierCategories: ['electronics'],
        createdAt: new Date()
      },
      {
        displayName: 'Non-Supplier User',
        email: 'user@test.com',
        isActive: true,
        isSupplier: false,
        supplierCategories: [],
        createdAt: new Date()
      }
    ];

    for (const supplier of testSuppliers) {
      await addDoc(collection(db, 'users'), supplier);
    }
  }

  async function cleanupTestData() {
    // In a real implementation, this would clean up test data
    console.log('Test cleanup: Supplier test data would be cleared');
  }
});
