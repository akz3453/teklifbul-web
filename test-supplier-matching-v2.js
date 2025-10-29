// Test script to verify supplier matching functionality
import { db } from "./firebase.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Helper: Convert string to slug format
function toSlug(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function testSupplierMatching() {
  try {
    console.log("Testing supplier matching functionality...");
    
    // Test 1: Find all active suppliers
    console.log("\n--- Test 1: All active suppliers ---");
    const allSuppliersQuery = query(
      collection(db, "users"),
      where("isSupplier", "==", true),
      where("isActive", "==", true)
    );
    
    const allSuppliersSnapshot = await getDocs(allSuppliersQuery);
    console.log(`Found ${allSuppliersSnapshot.size} active suppliers`);
    
    // Test 2: Test category matching
    const testCategories = ["elektrik", "mobilya", "inşaat-malzemeleri"];
    
    for (const category of testCategories) {
      console.log(`\n--- Test 2: Searching for suppliers in category '${category}' ---`);
      
      const categoryQuery = query(
        collection(db, "users"),
        where("isSupplier", "==", true),
        where("isActive", "==", true),
        where("supplierCategories", "array-contains", category)
      );
      
      try {
        const categorySnapshot = await getDocs(categoryQuery);
        console.log(`Found ${categorySnapshot.size} suppliers for category '${category}':`);
        
        categorySnapshot.docs.forEach(doc => {
          const data = doc.data();
          console.log(`  - ${doc.id}: ${data.companyName || data.displayName || 'Unknown'}`);
          console.log(`    Categories: ${JSON.stringify(data.supplierCategories)}`);
        });
      } catch (error) {
        console.error(`Error searching for suppliers with category '${category}':`, error.message);
      }
    }
    
    // Test 3: Test multi-category matching
    console.log("\n--- Test 3: Multi-category matching ---");
    const demandCategories = ["elektrik", "kablo"];
    console.log("Demand categories:", demandCategories);
    
    const multiCategoryQuery = query(
      collection(db, "users"),
      where("isSupplier", "==", true),
      where("isActive", "==", true),
      where("supplierCategories", "array-contains-any", demandCategories.slice(0, 10))
    );
    
    try {
      const multiCategorySnapshot = await getDocs(multiCategoryQuery);
      console.log(`Found ${multiCategorySnapshot.size} matching suppliers for demand:`);
      
      multiCategorySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const matchingCategories = data.supplierCategories.filter(cat => demandCategories.includes(cat));
        console.log(`  - ${doc.id}: ${data.companyName || data.displayName || 'Unknown'}`);
        console.log(`    Matching categories: ${JSON.stringify(matchingCategories)}`);
      });
    } catch (error) {
      console.error("Error searching for multi-category suppliers:", error.message);
    }
    
    console.log("\nTest completed.");
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run test
testSupplierMatching();