// Migration script to add isPublished and visibility fields to existing demands
import { db } from "./firebase.js";
import { collection, getDocs, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

async function migrateDemands() {
  try {
    console.log("Starting demand migration...");
    
    // Get all published demands (existing field)
    const q = query(collection(db, "demands"), where("published", "==", true));
    const snapshot = await getDocs(q);
    
    console.log(`Found ${snapshot.size} published demands to migrate`);
    
    let updatedCount = 0;
    const batchUpdates = [];
    
    snapshot.forEach((doc) => {
      const demandData = doc.data();
      
      // Only update if the fields don't already exist
      if (demandData.isPublished === undefined || demandData.visibility === undefined) {
        const updateData = {};
        
        // Set isPublished to true for previously published demands
        if (demandData.isPublished === undefined) {
          updateData.isPublished = true;
        }
        
        // Set visibility to "public" for previously published demands
        if (demandData.visibility === undefined) {
          updateData.visibility = "public";
        }
        
        batchUpdates.push({
          ref: doc.ref,
          data: updateData
        });
        
        updatedCount++;
      }
    });
    
    // Process updates in batches of 500 (Firestore limit)
    const batchSize = 500;
    for (let i = 0; i < batchUpdates.length; i += batchSize) {
      const batch = batchUpdates.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(batchUpdates.length/batchSize)}`);
      
      // In a real implementation, we would use Firestore batch operations
      // For now, we'll update each document individually
      for (const update of batch) {
        try {
          await updateDoc(update.ref, update.data);
          console.log(`Updated demand: ${update.ref.id}`);
        } catch (error) {
          console.error(`Failed to update demand ${update.ref.id}:`, error);
        }
      }
    }
    
    console.log(`Migration completed. Updated ${updatedCount} demands.`);
    
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

// Run migration
migrateDemands();