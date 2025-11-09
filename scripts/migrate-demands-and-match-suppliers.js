/**
 * Migration Script: Migrate all demands to ID-based categories AND match suppliers
 * 
 * Usage:
 *   node scripts/migrate-demands-and-match-suppliers.js --dry-run  (preview changes)
 *   node scripts/migrate-demands-and-match-suppliers.js --commit  (apply changes)
 * 
 * This script:
 * 1. Migrates all demands to have categoryIds (if missing)
 * 2. For all published demands:
 *    - Finds matching suppliers using new ID-based matching
 *    - Updates viewerIds field
 *    - Creates demandRecipients records
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  updateDoc, 
  doc, 
  writeBatch,
  addDoc,
  serverTimestamp,
  query,
  where
} from 'firebase/firestore';
import { normalizeToIds, getNameById, getAllCategories } from '../src/categories/category-service.js';
import { matchSuppliers } from '../src/matching/match-service.js';

// Firebase config (same as firebase.js)
const firebaseConfig = {
  apiKey: "AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE",
  authDomain: "teklifbul.firebaseapp.com",
  projectId: "teklifbul",
  storageBucket: "teklifbul.firebasestorage.app",
  appId: "1:636669818119:web:9085962e660831c36941a2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let dryRun = false;

// Parse command line arguments
const args = process.argv.slice(2);
if (args.includes('--commit')) {
  dryRun = false;
  console.log('⚠️ COMMIT MODE: Changes will be written to Firestore');
} else {
  dryRun = true;
  console.log('🔍 DRY-RUN MODE: No changes will be written');
}

/**
 * Migrate demand categories and match suppliers
 */
async function migrateDemandsAndMatchSuppliers() {
  console.log('\n📦 Starting demand migration and supplier matching...');
  
  const demandsRef = collection(db, 'demands');
  const snapshot = await getDocs(demandsRef);
  
  let processed = 0;
  let migrated = 0;
  let matched = 0;
  let skipped = 0;
  let errors = 0;
  
  // Process in batches of 100 (smaller batches for supplier matching)
  const batchSize = 100;
  let currentBatch = writeBatch(db);
  let batchCount = 0;
  
  for (const demandDoc of snapshot.docs) {
    processed++;
    const demandData = demandDoc.data();
    const demandId = demandDoc.id;
    
    try {
      // Step 1: Migrate categoryIds if missing
      let categoryIds = demandData.categoryIds || [];
      let needsCategoryMigration = false;
      
      if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
        // Collect all category tokens from legacy fields
        const categoryTokens = [];
        
        if (Array.isArray(demandData.categoryTags)) {
          categoryTokens.push(...demandData.categoryTags);
        }
        if (Array.isArray(demandData.supplierCategoryKeys)) {
          categoryTokens.push(...demandData.supplierCategoryKeys);
        }
        if (Array.isArray(demandData.categories)) {
          categoryTokens.push(...demandData.categories);
        }
        if (demandData.category && typeof demandData.category === 'string') {
          categoryTokens.push(demandData.category);
        }
        
        if (categoryTokens.length > 0) {
          categoryIds = normalizeToIds(categoryTokens);
          needsCategoryMigration = true;
        }
      }
      
      // Step 2: For published demands, match suppliers
      let matchingSupplierIds = [];
      const isPublished = demandData.isPublished === true || demandData.published === true || 
                          demandData.status === 'published' || demandData.status === 'approved';
      
      if (isPublished && categoryIds.length > 0) {
        try {
          // Prepare legacy formats for backward compatibility
          const allCategories = getAllCategories();
          const legacySlugs = categoryIds.map(id => {
            const cat = allCategories.find(c => c.id === id);
            return cat ? cat.slug : null;
          }).filter(Boolean);
          const legacyNames = categoryIds.map(id => getNameById(id)).filter(Boolean);
          
          // Use match service to find suppliers
          const matchedSuppliers = await matchSuppliers(db, {
            categoryIds: categoryIds,
            legacySlugs: legacySlugs,
            legacyNames: legacyNames
          });
          
          matchingSupplierIds = Array.from(new Set(matchedSuppliers.map(s => s.uid || s.id).filter(Boolean)));
          
          if (matchingSupplierIds.length > 0) {
            console.log(`✅ Demand ${demandId}: Matched ${matchingSupplierIds.length} suppliers`);
            matched++;
          }
        } catch (matchError) {
          console.warn(`⚠️ Supplier matching failed for demand ${demandId}:`, matchError.message);
          errors++;
        }
      }
      
      // Step 3: Prepare update data
      const updateData = {};
      
      if (needsCategoryMigration && categoryIds.length > 0) {
        updateData.categoryIds = categoryIds;
        migrated++;
      }
      
      if (isPublished && matchingSupplierIds.length > 0) {
        // Update viewerIds (include demand creator if available)
        const currentViewerIds = Array.isArray(demandData.viewerIds) ? demandData.viewerIds : [];
        const newViewerIds = Array.from(new Set([
          ...currentViewerIds,
          ...(demandData.createdBy ? [demandData.createdBy] : []),
          ...matchingSupplierIds
        ]));
        updateData.viewerIds = newViewerIds;
      }
      
      // Only update if there are changes
      if (Object.keys(updateData).length > 0) {
        if (dryRun) {
          console.log(`📝 Demand ${demandId}: Would update`, updateData);
        } else {
          // Add to batch
          const demandRef = doc(db, 'demands', demandId);
          currentBatch.update(demandRef, updateData);
          batchCount++;
          
          // Commit batch if full
          if (batchCount >= batchSize) {
            await currentBatch.commit();
            console.log(`💾 Committed batch of ${batchCount} updates`);
            currentBatch = writeBatch(db);
            batchCount = 0;
          }
        }
      } else {
        skipped++;
      }
      
      // Step 4: Create demandRecipients records for matched suppliers (only for published demands)
      if (!dryRun && isPublished && matchingSupplierIds.length > 0) {
        // Get legacy slugs for demandRecipients
        const allCategories = getAllCategories();
        const legacySlugs = categoryIds.map(id => {
          const cat = allCategories.find(c => c.id === id);
          return cat ? cat.slug : null;
        }).filter(Boolean);
        
        // Check existing demandRecipients to avoid duplicates
        const existingRecipientsQuery = query(
          collection(db, 'demandRecipients'),
          where('demandId', '==', demandId)
        );
        const existingRecipientsSnap = await getDocs(existingRecipientsQuery);
        const existingSupplierIds = new Set(
          existingRecipientsSnap.docs.map(d => d.data().supplierId).filter(Boolean)
        );
        
        // Create demandRecipients for new matches
        for (const supplierId of matchingSupplierIds) {
          if (!existingSupplierIds.has(supplierId)) {
            try {
              await addDoc(collection(db, 'demandRecipients'), {
                demandId: demandId,
                supplierId: supplierId,
                buyerId: demandData.createdBy || null,
                matchedAt: serverTimestamp(),
                categories: categoryIds,
                categoryTags: legacySlugs,
                status: 'matched',
                matchedCategories: categoryIds
              });
            } catch (recipientError) {
              console.warn(`⚠️ Could not create demandRecipient for ${demandId} -> ${supplierId}:`, recipientError.message);
            }
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Error processing demand ${demandId}:`, error.message);
      errors++;
    }
  }
  
  // Commit remaining batch
  if (!dryRun && batchCount > 0) {
    await currentBatch.commit();
    console.log(`💾 Committed final batch of ${batchCount} updates`);
  }
  
  console.log(`\n📊 Migration Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Migrated (categoryIds): ${migrated}`);
  console.log(`   Matched suppliers: ${matched}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
  
  return { processed, migrated, matched, skipped, errors };
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting demand migration and supplier matching...\n');
  
  try {
    const stats = await migrateDemandsAndMatchSuppliers();
    
    console.log('\n✅ Migration completed!');
    console.log('\n📊 Final Summary:');
    console.log(`   Demands processed: ${stats.processed}`);
    console.log(`   Category migrations: ${stats.migrated}`);
    console.log(`   Supplier matches: ${stats.matched}`);
    console.log(`   Skipped: ${stats.skipped}`);
    console.log(`   Errors: ${stats.errors}`);
    
    if (dryRun) {
      console.log('\n💡 This was a DRY-RUN. Run with --commit to apply changes.');
    } else {
      console.log('\n✅ Changes have been committed to Firestore.');
      console.log('💡 Check demandRecipients collection for matched suppliers.');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
runMigration();

