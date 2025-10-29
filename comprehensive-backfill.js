// Comprehensive backfill script to update existing supplier records with proper fields
import { db } from "./firebase.js";
import { collection, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Helper: Convert string to slug format
function toSlug(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

async function comprehensiveBackfill() {
  try {
    console.log("Starting comprehensive supplier backfill...");
    
    // Get all users who might be suppliers
    const q = query(collection(db, "users"));
    const snapshot = await getDocs(q);
    
    console.log(`Found ${snapshot.size} users to process`);
    
    let updatedCount = 0;
    
    for (const doc of snapshot.docs) {
      const userData = doc.data();
      let updates = {};
      let needsUpdate = false;
      
      // Check if user is a supplier
      if (userData.role === "supplier" || userData.roles?.includes("supplier")) {
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
        
        // Check and update supplier categories
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
            console.log(`Updated categories for user ${doc.id}:`, slugCategories);
          }
        } else if (userData.categories && Array.isArray(userData.categories)) {
          // Migrate from old categories field
          const slugCategories = userData.categories.map(toSlug);
          updates.supplierCategories = slugCategories;
          updates.categories = undefined; // Remove old field
          needsUpdate = true;
          console.log(`Migrated categories for user ${doc.id}:`, slugCategories);
        } else if (userData.category) {
          // Migrate from old single category field
          const slugCategory = toSlug(userData.category);
          updates.supplierCategories = [slugCategory];
          updates.category = undefined; // Remove old field
          needsUpdate = true;
          console.log(`Migrated category for user ${doc.id}:`, slugCategory);
        }
      }
      
      // Apply updates if needed
      if (needsUpdate) {
        try {
          await updateDoc(doc.ref, updates);
          console.log(`Updated user ${doc.id} with fields:`, Object.keys(updates));
          updatedCount++;
        } catch (error) {
          console.error(`Failed to update user ${doc.id}:`, error);
        }
      }
    }
    
    console.log(`Backfill completed. Updated ${updatedCount} user records.`);
    
  } catch (error) {
    console.error("Backfill failed:", error);
  }
}

// Run backfill
comprehensiveBackfill();