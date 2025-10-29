// Enhanced backfill script to ensure data consistency for supplier matching
import { db } from "./firebase.js";
import { collection, query, where, getDocs, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Helper: Convert string to slug format
function toSlug(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function enhancedBackfill() {
  try {
    console.log("Starting enhanced backfill for supplier matching consistency...");
    
    // Process users who might be suppliers
    console.log("\n--- Processing supplier users ---");
    const usersQuery = query(collection(db, "users"));
    const usersSnapshot = await getDocs(usersQuery);
    
    console.log(`Found ${usersSnapshot.size} users to process`);
    
    let supplierCount = 0;
    let updatedSupplierCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      let updates = {};
      let needsUpdate = false;
      
      // Check if user is a supplier
      const isSupplier = userData.role === "supplier" || 
                         (Array.isArray(userData.roles) && userData.roles.includes("supplier")) ||
                         userData.isSupplier === true;
      
      if (isSupplier) {
        supplierCount++;
        
        // Ensure isSupplier field is set
        if (userData.isSupplier !== true) {
          updates.isSupplier = true;
          needsUpdate = true;
        }
        
        // Ensure isActive field is set (default to true)
        if (userData.isActive === undefined) {
          updates.isActive = true;
          needsUpdate = true;
        }
        
        // Process supplier categories
        if (userData.supplierCategories && Array.isArray(userData.supplierCategories)) {
          // Check if any category is not in slug format
          const needsCategoryUpdate = userData.supplierCategories.some(cat => 
            typeof cat === 'string' && (cat.includes(' ') || cat !== cat.toLowerCase() || /[^a-z0-9-]/.test(cat))
          );
          
          if (needsCategoryUpdate) {
            // Convert categories to slug format
            const slugCategories = userData.supplierCategories.map(toSlug);
            updates.supplierCategories = slugCategories;
            needsUpdate = true;
            console.log(`  Updated categories for supplier ${userDoc.id}:`, slugCategories);
          }
        } else if (userData.categories && Array.isArray(userData.categories)) {
          // Migrate from old categories field
          const slugCategories = userData.categories.map(toSlug);
          updates.supplierCategories = slugCategories;
          updates.categories = undefined; // Remove old field
          needsUpdate = true;
          console.log(`  Migrated categories for supplier ${userDoc.id}:`, slugCategories);
        } else if (userData.category) {
          // Migrate from old single category field
          const slugCategory = toSlug(userData.category);
          updates.supplierCategories = [slugCategory];
          updates.category = undefined; // Remove old field
          needsUpdate = true;
          console.log(`  Migrated category for supplier ${userDoc.id}:`, slugCategory);
        }
        
        // Apply updates if needed
        if (needsUpdate) {
          try {
            await updateDoc(userDoc.ref, updates);
            console.log(`  Updated supplier ${userDoc.id} with fields:`, Object.keys(updates));
            updatedSupplierCount++;
          } catch (error) {
            console.error(`  Failed to update supplier ${userDoc.id}:`, error.message);
          }
        }
      }
    }
    
    console.log(`\nProcessed ${supplierCount} suppliers, updated ${updatedSupplierCount} records.`);
    
    // Process demands to ensure proper category formatting
    console.log("\n--- Processing demands ---");
    const demandsQuery = query(collection(db, "demands"));
    const demandsSnapshot = await getDocs(demandsQuery);
    
    console.log(`Found ${demandsSnapshot.size} demands to process`);
    
    let updatedDemandCount = 0;
    
    for (const demandDoc of demandsSnapshot.docs) {
      const demandData = demandDoc.data();
      let updates = {};
      let needsUpdate = false;
      
      // Process category tags
      if (demandData.categoryTags && Array.isArray(demandData.categoryTags)) {
        // Check if any category is not in slug format
        const needsCategoryUpdate = demandData.categoryTags.some(cat => 
          typeof cat === 'string' && (cat.includes(' ') || cat !== cat.toLowerCase() || /[^a-z0-9-]/.test(cat))
        );
        
        if (needsCategoryUpdate) {
          // Convert categories to slug format
          const slugCategories = demandData.categoryTags.map(toSlug);
          updates.categoryTags = slugCategories;
          needsUpdate = true;
          console.log(`  Updated demand categories for ${demandDoc.id}:`, slugCategories);
        }
      }
      
      // Apply updates if needed
      if (needsUpdate) {
        try {
          await updateDoc(demandDoc.ref, updates);
          console.log(`  Updated demand ${demandDoc.id} with fields:`, Object.keys(updates));
          updatedDemandCount++;
        } catch (error) {
          console.error(`  Failed to update demand ${demandDoc.id}:`, error.message);
        }
      }
    }
    
    console.log(`Processed demands, updated ${updatedDemandCount} records.`);
    
    // Create index for unmatched demands collection if it doesn't exist
    console.log("\n--- Setting up unmatched demands tracking ---");
    try {
      // This is just for documentation - Firestore creates indexes automatically
      console.log("Unmatched demands will be tracked in the 'unmatchedDemands' collection");
      console.log("This collection will help identify category matching issues");
    } catch (error) {
      console.warn("Could not set up unmatched demands tracking:", error.message);
    }
    
    console.log("\nEnhanced backfill completed successfully!");
    
  } catch (error) {
    console.error("Enhanced backfill failed:", error);
  }
}

// Run backfill
enhancedBackfill();