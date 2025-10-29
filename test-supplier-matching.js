// Test script to verify supplier matching functionality
import { publishDemandAndMatchSuppliers } from './publish-demand.js';
import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Test script to verify supplier matching functionality
 */
async function testSupplierMatching() {
  try {
    // Create a test demand
    const testDemand = {
      id: 'test-demand-' + Date.now(),
      title: 'Test Demand for Supplier Matching',
      description: 'This is a test demand to verify supplier matching functionality',
      categories: ['electronics', 'computers'], // Assuming these categories exist
      isPublished: true,
      visibility: 'public',
      createdBy: 'test-user-id', // This would be a real user ID in practice
      createdAt: serverTimestamp()
    };

    console.log('Creating test demand...');
    
    // Publish the demand and match with suppliers
    await publishDemandAndMatchSuppliers(testDemand);
    
    console.log('Demand published and suppliers matched successfully!');
    console.log('Check the demandRecipients collection in Firestore to verify matches.');
    
  } catch (error) {
    console.error('Error testing supplier matching:', error);
  }
}

// Run the test if this script is executed directly
if (typeof window === 'undefined') {
  // Node.js environment
  testSupplierMatching();
}

export { testSupplierMatching };
