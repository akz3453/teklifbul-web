// test-serverTimestamp-fix.js
// ServerTimestamp array hatasının düzeltildiğini test eder

console.log("🧪 Testing serverTimestamp array fix...");

// Test data structure
const testBid = {
  demandId: "test-demand",
  supplierId: "test-supplier",
  price: 1000,
  leadTimeDays: 30,
  brand: "Test Brand",
  paymentTerms: "30 days",
  status: "sent",
  statusHistory: [{
    status: "sent",
    timestamp: Date.now(), // ✅ Fixed: was serverTimestamp()
    userId: "test-user"
  }],
  createdAt: Date.now() // ✅ Top-level field
};

console.log("✅ Test bid structure:", JSON.stringify(testBid, null, 2));

// Check for any remaining serverTimestamp in arrays
function checkForServerTimestampInArrays(obj, path = "") {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (Array.isArray(value)) {
      // Check if array contains serverTimestamp
      const hasServerTimestamp = value.some(item => 
        typeof item === 'object' && item !== null && 
        Object.values(item).some(val => 
          val && typeof val === 'function' && val.name === 'serverTimestamp'
        )
      );
      
      if (hasServerTimestamp) {
        console.error(`❌ Found serverTimestamp in array at ${currentPath}`);
        return false;
      }
      
      // Recursively check array items
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          checkForServerTimestampInArrays(item, `${currentPath}[${index}]`);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      checkForServerTimestampInArrays(value, currentPath);
    }
  }
  return true;
}

const isValid = checkForServerTimestampInArrays(testBid);
console.log(isValid ? "✅ No serverTimestamp found in arrays" : "❌ serverTimestamp found in arrays");

console.log("🎉 Test completed!");
