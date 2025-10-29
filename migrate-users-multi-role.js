// migrate-users-multi-role.js
// Users koleksiyonunu çok rollü firma desteği için günceller

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE",
  authDomain: "teklifbul.firebaseapp.com",
  projectId: "teklifbul",
  storageBucket: "teklifbul.firebasestorage.app",
  appId: "1:636669818119:web:9085962e660831c36941a2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateUsersToMultiRole() {
  console.log("🔄 Starting users migration to multi-role support...");
  
  try {
    // Get all users
    const usersSnapshot = await getDocs(collection(db, "users"));
    console.log(`📊 Found ${usersSnapshot.size} users to migrate`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      console.log(`👤 Processing user: ${userId}`);
      
      // Check if already migrated
      if (userData.roles && typeof userData.roles === 'object') {
        console.log(`⏭️ User ${userId} already has roles object, skipping`);
        skippedCount++;
        continue;
      }
      
      // Determine roles based on existing data
      const roles = {
        buyer: false,
        supplier: false
      };
      
      // Check old role field
      if (userData.role === 'buyer' || userData.role === 'supplier') {
        roles[userData.role] = true;
      }
      
      // Check if user has created demands (buyer role)
      const demandsQuery = query(collection(db, "demands"), where("createdBy", "==", userId));
      const demandsSnapshot = await getDocs(demandsQuery);
      if (demandsSnapshot.size > 0) {
        roles.buyer = true;
      }
      
      // Check if user has submitted bids (supplier role)
      const bidsQuery = query(collection(db, "bids"), where("supplierId", "==", userId));
      const bidsSnapshot = await getDocs(bidsQuery);
      if (bidsSnapshot.size > 0) {
        roles.supplier = true;
      }
      
      // If no roles determined, default to buyer
      if (!roles.buyer && !roles.supplier) {
        roles.buyer = true;
      }
      
      // Ensure categories is an array
      const categories = Array.isArray(userData.categories) ? userData.categories : [];
      
      // Ensure groupIds is an array
      const groupIds = Array.isArray(userData.groupIds) ? userData.groupIds : [];
      
      // Ensure isActive is boolean
      const isActive = userData.isActive !== false; // Default to true
      
      // Update user document
      await updateDoc(doc(db, "users", userId), {
        roles: roles,
        categories: categories,
        groupIds: groupIds,
        isActive: isActive,
        // Keep existing fields
        companyId: userData.companyId || null,
        companyName: userData.companyName || null,
        // Remove old role field
        role: null
      });
      
      console.log(`✅ Migrated user ${userId}:`, {
        roles,
        categories: categories.length,
        groupIds: groupIds.length,
        isActive
      });
      
      migratedCount++;
    }
    
    console.log(`🎉 Migration completed!`);
    console.log(`✅ Migrated: ${migratedCount} users`);
    console.log(`⏭️ Skipped: ${skippedCount} users`);
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateUsersToMultiRole()
    .then(() => {
      console.log("Migration completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

export { migrateUsersToMultiRole };
