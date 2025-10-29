// Final test script to verify supplier matching functionality
import { db } from "./firebase.js";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

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
    
    // Test 2: Test category matching with new format
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
    
    // Test 4: Simulate demand creation matching
    console.log("\n--- Test 4: Simulating demand creation matching ---");
    const sampleDemandCategories = ["elektrik", "inşaat-malzemeleri"];
    console.log("Sample demand categories:", sampleDemandCategories);
    
    // Simulate the exact query used in demand-new.html
    const demandMatchingQuery = query(
      collection(db, "users"),
      where("isSupplier", "==", true),
      where("isActive", "==", true),
      where("supplierCategories", "array-contains-any", sampleDemandCategories.slice(0, 10))
    );
    
    try {
      const demandMatchingSnapshot = await getDocs(demandMatchingQuery);
      const supplierUids = demandMatchingSnapshot.docs.map(d => d.id);
      console.log(`Found ${supplierUids.length} suppliers for sample demand:`);
      console.log("Supplier UIDs:", supplierUids);
      
      if (supplierUids.length === 0) {
        console.warn("No matching suppliers found - this would be logged to unmatchedDemands in production");
        // Simulate logging to unmatchedDemands
        try {
          const unmatchedDoc = await addDoc(collection(db, "unmatchedDemands"), {
            categories: sampleDemandCategories,
            createdAt: serverTimestamp(),
            testRun: true
          });
          console.log("Logged to unmatchedDemands with doc ID:", unmatchedDoc.id);
        } catch (logError) {
          console.warn("Could not log to unmatchedDemands:", logError.message);
        }
      }
    } catch (error) {
      console.error("Error in demand matching simulation:", error.message);
    }
    
    // Test 5: Verify slug conversion
    console.log("\n--- Test 5: Slug conversion verification ---");
    const testStrings = [
      "Elektrik Kablo",
      "İnşaat Malzemeleri",
      "Mobilya & Dekorasyon",
      "Hırdavat Malzemeleri"
    ];
    
    testStrings.forEach(str => {
      const slug = toSlug(str);
      console.log(`  "${str}" -> "${slug}"`);
    });
    
    console.log("\nTest completed successfully!");
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run test
testSupplierMatching();