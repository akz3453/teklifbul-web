// Backfill script to update existing supplier records with slug format categories
import { db } from "./firebase.js";
import { collection, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

// Helper: Convert string to slug format
function toSlug(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-');
}

async function backfillSupplierCategories() {
  try {
    console.log("Starting supplier category backfill...");
    
    // Get all supplier users
    const q = query(collection(db, "users"), where("role", "==", "supplier"));
    const snapshot = await getDocs(q);
    
    console.log(`Found ${snapshot.size} supplier users to process`);
    
    let updatedCount = 0;
    
    for (const doc of snapshot.docs) {
      const userData = doc.data();
      
      // Check if user has categories but not in slug format
      if (userData.supplierCategories && Array.isArray(userData.supplierCategories)) {
        // Check if any category is not in slug format
        const needsUpdate = userData.supplierCategories.some(cat => 
          typeof cat === 'string' && (cat.includes(' ') || cat !== cat.toLowerCase())
        );
        
        if (needsUpdate) {
          // Convert categories to slug format
          const slugCategories = userData.supplierCategories.map(toSlug);
          
          try {
            await updateDoc(doc.ref, { supplierCategories: slugCategories });
            console.log(`Updated categories for user ${doc.id}:`, slugCategories);
            updatedCount++;
          } catch (error) {
            console.error(`Failed to update categories for user ${doc.id}:`, error);
          }
        }
      }
      
      // Also check for old 'category' field
      if (userData.category && !userData.supplierCategories) {
        try {
          const slugCategory = toSlug(userData.category);
          await updateDoc(doc.ref, { 
            supplierCategories: [slugCategory],
            category: undefined // Remove old field
          });
          console.log(`Migrated category for user ${doc.id}:`, slugCategory);
          updatedCount++;
        } catch (error) {
          console.error(`Failed to migrate category for user ${doc.id}:`, error);
        }
      }
    }
    
    console.log(`Backfill completed. Updated ${updatedCount} supplier records.`);
    
  } catch (error) {
    console.error("Backfill failed:", error);
  }
}

// Run backfill
backfillSupplierCategories();