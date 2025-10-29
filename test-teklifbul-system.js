// test-teklifbul-system.js
// Teklifbul sistem test script'i

console.log("🧪 Testing Teklifbul System...");

// Test 1: Global exports
console.log("1. Testing global exports...");
if (window.__db && window.__auth && window.__fs) {
  console.log("✅ Global exports available");
} else {
  console.log("❌ Global exports missing");
}

// Test 2: Firebase connection
console.log("2. Testing Firebase connection...");
if (window.__auth && window.__auth.currentUser) {
  console.log("✅ User authenticated:", window.__auth.currentUser.email);
} else {
  console.log("⚠️ No authenticated user");
}

// Test 3: Firestore queries
console.log("3. Testing Firestore queries...");
async function testFirestoreQueries() {
  try {
    const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    
    // Test demands query
    const demandsQuery = query(collection(window.__db, 'demands'), where('isPublished', '==', true));
    const demandsSnap = await getDocs(demandsQuery);
    console.log("✅ Demands query successful:", demandsSnap.size, "published demands");
    
    // Test users query
    const usersQuery = query(collection(window.__db, 'users'), where('isActive', '==', true));
    const usersSnap = await getDocs(usersQuery);
    console.log("✅ Users query successful:", usersSnap.size, "active users");
    
    // Test demandRecipients query
    const recipientsQuery = query(collection(window.__db, 'demandRecipients'));
    const recipientsSnap = await getDocs(recipientsQuery);
    console.log("✅ DemandRecipients query successful:", recipientsSnap.size, "recipients");
    
  } catch (e) {
    console.error("❌ Firestore query failed:", e);
  }
}

// Test 4: System functionality
console.log("4. Testing system functionality...");
function testSystemFunctionality() {
  // Check if key functions exist
  const functions = [
    'publishDemandAndMatchSuppliers',
    'loadIncoming',
    'loadOutgoing',
    'showIndexHint'
  ];
  
  functions.forEach(func => {
    if (typeof window[func] === 'function') {
      console.log("✅ Function exists:", func);
    } else {
      console.log("❌ Function missing:", func);
    }
  });
}

// Run tests
testSystemFunctionality();
testFirestoreQueries();

console.log("🎉 System test completed!");
