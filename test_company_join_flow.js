/**
 * Test Suite: Company Join Flow
 * 
 * This file contains test cases to verify the company join flow works correctly.
 * 
 * Run tests:
 *   node test_company_join_flow.js
 * 
 * Or use Jest:
 *   npm install --save-dev jest
 *   jest test_company_join_flow.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin for tests
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

/**
 * Test Case 1: After signup with code
 * 
 * Expected:
 * - users/{uid}.companyJoinStatus === 'pending'
 * - companyJoinRequests contains a doc with userId and status === 'pending'
 * - users/{uid}.companyId is absent
 */
async function testAfterSignup(userId) {
  console.log('\n🧪 Test 1: After Signup with Company Code');
  console.log('='.repeat(60));
  
  try {
    // Check user document
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists()) {
      console.log('❌ User document not found');
      return false;
    }
    
    const userData = userDoc.data();
    
    // Assertions
    const assertions = [];
    
    // 1. companyJoinStatus should be 'pending'
    assertions.push({
      name: 'companyJoinStatus is pending',
      passed: userData.companyJoinStatus === 'pending',
      expected: 'pending',
      actual: userData.companyJoinStatus
    });
    
    // 2. companyId should NOT exist
    assertions.push({
      name: 'companyId is absent',
      passed: !userData.companyId || userData.companyId === undefined,
      expected: 'undefined or null',
      actual: userData.companyId || 'undefined'
    });
    
    // 3. Check companyJoinRequests
    const requestsQuery = await db.collection('companyJoinRequests')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    
    assertions.push({
      name: 'Pending request exists',
      passed: !requestsQuery.empty,
      expected: 'At least one pending request',
      actual: requestsQuery.empty ? 'No requests found' : `${requestsQuery.size} request(s) found`
    });
    
    // Print results
    let allPassed = true;
    assertions.forEach(assertion => {
      const icon = assertion.passed ? '✅' : '❌';
      console.log(`${icon} ${assertion.name}`);
      if (!assertion.passed) {
        console.log(`   Expected: ${assertion.expected}`);
        console.log(`   Actual: ${assertion.actual}`);
        allPassed = false;
      }
    });
    
    return allPassed;
    
  } catch (error) {
    console.error('❌ Test error:', error);
    return false;
  }
}

/**
 * Test Case 2: After admin approval
 * 
 * Expected:
 * - companyJoinRequests.status === 'accepted'
 * - users/{uid}.companyId set to companyId
 * - users/{uid}.companyJoinStatus === 'accepted'
 */
async function testAfterApproval(userId, companyId) {
  console.log('\n🧪 Test 2: After Admin Approval');
  console.log('='.repeat(60));
  
  try {
    // Check user document
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists()) {
      console.log('❌ User document not found');
      return false;
    }
    
    const userData = userDoc.data();
    
    // Check companyJoinRequests
    const requestsQuery = await db.collection('companyJoinRequests')
      .where('userId', '==', userId)
      .where('status', '==', 'accepted')
      .get();
    
    const assertions = [];
    
    // 1. Request status should be 'accepted'
    assertions.push({
      name: 'Request status is accepted',
      passed: !requestsQuery.empty,
      expected: 'At least one accepted request',
      actual: requestsQuery.empty ? 'No accepted requests' : 'Request found'
    });
    
    // 2. companyId should be set
    assertions.push({
      name: 'companyId is set',
      passed: userData.companyId === companyId,
      expected: companyId,
      actual: userData.companyId || 'not set'
    });
    
    // 3. companyJoinStatus should be 'accepted'
    assertions.push({
      name: 'companyJoinStatus is accepted',
      passed: userData.companyJoinStatus === 'accepted',
      expected: 'accepted',
      actual: userData.companyJoinStatus || 'not set'
    });
    
    // Print results
    let allPassed = true;
    assertions.forEach(assertion => {
      const icon = assertion.passed ? '✅' : '❌';
      console.log(`${icon} ${assertion.name}`);
      if (!assertion.passed) {
        console.log(`   Expected: ${assertion.expected}`);
        console.log(`   Actual: ${assertion.actual}`);
        allPassed = false;
      }
    });
    
    return allPassed;
    
  } catch (error) {
    console.error('❌ Test error:', error);
    return false;
  }
}

/**
 * Test Case 3: Active users query excludes pending users
 */
async function testActiveUsersQuery(companyId) {
  console.log('\n🧪 Test 3: Active Users Query');
  console.log('='.repeat(60));
  
  try {
    // Query active users (should only return accepted)
    const activeUsersQuery = await db.collection('users')
      .where('companyId', '==', companyId)
      .where('companyJoinStatus', '==', 'accepted')
      .get();
    
    // Get all users with companyId (for comparison)
    const allUsersQuery = await db.collection('users')
      .where('companyId', '==', companyId)
      .get();
    
    // Get pending users
    const pendingUsers = [];
    for (const userDoc of allUsersQuery.docs) {
      const userData = userDoc.data();
      if (userData.companyJoinStatus === 'pending') {
        pendingUsers.push(userDoc.id);
      }
    }
    
    const assertions = [];
    
    // 1. Active users should only include accepted
    assertions.push({
      name: 'Active users only include accepted',
      passed: activeUsersQuery.docs.every(doc => {
        const data = doc.data();
        return data.companyJoinStatus === 'accepted';
      }),
      expected: 'All users have status "accepted"',
      actual: `${activeUsersQuery.size} active users found`
    });
    
    // 2. Pending users should NOT be in active list
    const activeUserIds = activeUsersQuery.docs.map(doc => doc.id);
    const pendingInActive = pendingUsers.filter(id => activeUserIds.includes(id));
    
    assertions.push({
      name: 'Pending users excluded from active list',
      passed: pendingInActive.length === 0,
      expected: 'No pending users in active list',
      actual: pendingInActive.length > 0 ? `${pendingInActive.length} pending users found in active list` : 'OK'
    });
    
    // Print results
    let allPassed = true;
    assertions.forEach(assertion => {
      const icon = assertion.passed ? '✅' : '❌';
      console.log(`${icon} ${assertion.name}`);
      if (!assertion.passed) {
        console.log(`   ${assertion.actual}`);
        allPassed = false;
      }
    });
    
    console.log(`\n📊 Statistics:`);
    console.log(`   Total users with companyId: ${allUsersQuery.size}`);
    console.log(`   Active users (accepted): ${activeUsersQuery.size}`);
    console.log(`   Pending users: ${pendingUsers.length}`);
    
    return allPassed;
    
  } catch (error) {
    console.error('❌ Test error:', error);
    return false;
  }
}

/**
 * Sample Firestore Documents for Test Cases
 */
const SAMPLE_DOCUMENTS = {
  // After signup (CORRECT)
  userAfterSignup: {
    displayName: "Test User",
    email: "test@example.com",
    companyCode: "UL67HQYH",
    companyJoinStatus: "pending",
    requestedCompanyRole: "buyer:satinalma_yetkilisi",
    // companyId: NOT SET
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  
  // After signup (WRONG - should be fixed by migration)
  userAfterSignupWrong: {
    displayName: "Wrong User",
    email: "wrong@example.com",
    companyCode: "UL67HQYH",
    companyId: "company123", // ❌ Should not be set
    companyJoinStatus: "pending", // Should be pending but companyId shouldn't exist
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  
  // After approval (CORRECT)
  userAfterApproval: {
    displayName: "Approved User",
    email: "approved@example.com",
    companyId: "company123", // ✅ Set after approval
    companyJoinStatus: "accepted", // ✅ Set to accepted
    companyRoleKey: "buyer:satinalma_yetkilisi",
    companyRole: "satinalma_yetkilisi",
    companyRoleType: "buyer",
    approvedAt: admin.firestore.FieldValue.serverTimestamp()
  },
  
  // Join request (pending)
  joinRequestPending: {
    userId: "user123",
    userEmail: "test@example.com",
    companyCode: "UL67HQYH",
    companyId: "company123",
    requestedRole: "buyer",
    requestedCompanyRole: "buyer:satinalma_yetkilisi",
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  
  // Join request (accepted)
  joinRequestAccepted: {
    userId: "user123",
    userEmail: "test@example.com",
    companyCode: "UL67HQYH",
    companyId: "company123",
    requestedRole: "buyer",
    requestedCompanyRole: "buyer:satinalma_yetkilisi",
    status: "accepted",
    approvedRole: "buyer:satinalma_yetkilisi",
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedBy: "admin123"
  }
};

/**
 * Run all tests
 */
async function runTests() {
  console.log('\n🚀 Running Company Join Flow Tests\n');
  
  // You need to provide actual test user IDs and company IDs
  // For manual testing, replace these with real values
  const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-id';
  const TEST_COMPANY_ID = process.env.TEST_COMPANY_ID || 'test-company-id';
  
  if (TEST_USER_ID === 'test-user-id' || TEST_COMPANY_ID === 'test-company-id') {
    console.log('⚠️  Using placeholder IDs. Set TEST_USER_ID and TEST_COMPANY_ID environment variables for real tests.');
    console.log('   Example: TEST_USER_ID=abc123 TEST_COMPANY_ID=xyz789 node test_company_join_flow.js\n');
  }
  
  const results = [];
  
  // Test 1: After signup
  results.push(await testAfterSignup(TEST_USER_ID));
  
  // Test 2: After approval
  results.push(await testAfterApproval(TEST_USER_ID, TEST_COMPANY_ID));
  
  // Test 3: Active users query
  results.push(await testActiveUsersQuery(TEST_COMPANY_ID));
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  console.log('='.repeat(60));
  
  if (passed === total) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

// Export for Jest
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testAfterSignup,
    testAfterApproval,
    testActiveUsersQuery,
    SAMPLE_DOCUMENTS
  };
  
  // Run if called directly
  if (require.main === module) {
    runTests();
  }
}

