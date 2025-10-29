/**
 * Demands Service Tests
 * Tests for demand-related functionality
 */

import { getPublicDemands, getUserDemands, createDemand, publishDemand } from '../assets/js/services/demands.js';
import { getFirestore, collection, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';

describe('Demands Service', () => {
  let db;

  beforeAll(() => {
    db = global.firebaseDb;
  });

  beforeEach(async () => {
    // Create test data
    await createTestDemands();
  });

  afterEach(async () => {
    // Clean up test data
    await cleanupTestData();
  });

  describe('getPublicDemands', () => {
    test('should return only published public demands', async () => {
      const demands = await getPublicDemands(10);
      
      expect(demands).toBeDefined();
      expect(Array.isArray(demands)).toBe(true);
      
      // All demands should be published and public
      demands.forEach(demand => {
        expect(demand.isPublished).toBe(true);
        expect(demand.visibility).toBe('public');
      });
    });

    test('should respect limit parameter', async () => {
      const demands = await getPublicDemands(5);
      expect(demands.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getUserDemands', () => {
    test('should return demands created by specific user', async () => {
      const testUserId = 'test-user-123';
      const demands = await getUserDemands(testUserId, 10);
      
      expect(demands).toBeDefined();
      expect(Array.isArray(demands)).toBe(true);
      
      // All demands should be created by the test user
      demands.forEach(demand => {
        expect(demand.createdBy).toBe(testUserId);
      });
    });
  });

  describe('createDemand', () => {
    test('should create a new demand with required fields', async () => {
      const demandData = {
        title: 'Test Demand',
        description: 'Test Description',
        createdBy: 'test-user-123',
        isPublished: false,
        visibility: 'private'
      };

      const demandId = await createDemand(demandData);
      
      expect(demandId).toBeDefined();
      expect(typeof demandId).toBe('string');
      expect(demandId.length).toBeGreaterThan(0);
    });

    test('should generate SATFK for new demands', async () => {
      const demandData = {
        title: 'Test Demand with SATFK',
        description: 'Test Description',
        createdBy: 'test-user-123',
        isPublished: false,
        visibility: 'private'
      };

      const demandId = await createDemand(demandData);
      
      // Wait a bit for the Cloud Function to generate SATFK
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the demand to check SATFK
      const demandDoc = await getDoc(doc(db, 'demands', demandId));
      const demand = demandDoc.data();
      
      expect(demand.satfk).toBeDefined();
      expect(demand.satfk).toMatch(/^SATFK-\d{8}-[0-9A-Z]+$/);
    });
  });

  describe('publishDemand', () => {
    test('should publish a demand with correct visibility', async () => {
      // First create a demand
      const demandData = {
        title: 'Test Demand for Publishing',
        description: 'Test Description',
        createdBy: 'test-user-123',
        isPublished: false,
        visibility: 'private'
      };

      const demandId = await createDemand(demandData);
      
      // Then publish it
      await publishDemand(demandId, 'public', 'test-user-123');
      
      // Verify the demand was published
      const demands = await getPublicDemands(10);
      const publishedDemand = demands.find(d => d.id === demandId);
      
      expect(publishedDemand).toBeDefined();
      expect(publishedDemand.isPublished).toBe(true);
      expect(publishedDemand.visibility).toBe('public');
    });
  });

  // Helper functions
  async function createTestDemands() {
    const testDemands = [
      {
        title: 'Public Demand 1',
        description: 'A public demand',
        createdBy: 'test-user-123',
        isPublished: true,
        visibility: 'public',
        createdAt: new Date()
      },
      {
        title: 'Public Demand 2',
        description: 'Another public demand',
        createdBy: 'test-user-456',
        isPublished: true,
        visibility: 'public',
        createdAt: new Date()
      },
      {
        title: 'Private Demand',
        description: 'A private demand',
        createdBy: 'test-user-123',
        isPublished: false,
        visibility: 'private',
        createdAt: new Date()
      },
      {
        title: 'Company Demand',
        description: 'A company demand',
        createdBy: 'test-user-123',
        isPublished: true,
        visibility: 'company',
        createdAt: new Date()
      }
    ];

    for (const demand of testDemands) {
      await addDoc(collection(db, 'demands'), demand);
    }
  }

  async function cleanupTestData() {
    // In a real implementation, this would clean up test data
    // For now, we'll just log that cleanup would happen
    console.log('Test cleanup: Demand test data would be cleared');
  }
});
