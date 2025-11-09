/**
 * Migration Script: Convert legacy category formats (slug/name) to ID-based system
 * 
 * Usage:
 *   node scripts/migrate-categories-to-ids.js --dry-run  (preview changes)
 *   node scripts/migrate-categories-to-ids.js --commit  (apply changes)
 * 
 * This script:
 * 1. Reads all users (suppliers) from Firestore
 * 2. Normalizes their category fields to IDs using category-service
 * 3. Reads all demands from Firestore
 * 4. Normalizes their category fields to IDs
 * 5. Updates Firestore documents with new categoryIds
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { normalizeToIds, getNameById } from '../src/categories/category-service.js';

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
 * Migrate suppliers collection
 */
async function migrateSuppliers() {
  console.log('\n📦 Starting supplier migration...');
  
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Process in batches of 500 (Firestore batch limit)
  const batchSize = 500;
  let currentBatch = writeBatch(db);
  let batchCount = 0;
  
  for (const userDoc of snapshot.docs) {
    processed++;
    const userData = userDoc.data();
    const userId = userDoc.id;
    
    // Skip if already has supplierCategoryIds
    if (Array.isArray(userData.supplierCategoryIds) && userData.supplierCategoryIds.length > 0) {
      skipped++;
      continue;
    }
    
    // Check if user is a supplier
    const isSupplier = userData.roles?.includes('supplier');
    if (!isSupplier) {
      skipped++;
      continue;
    }
    
    // Collect all category tokens
    const categoryTokens = [];
    
    // Add legacy formats
    if (Array.isArray(userData.supplierCategoryKeys)) {
      categoryTokens.push(...userData.supplierCategoryKeys);
    }
    if (Array.isArray(userData.supplierCategories)) {
      categoryTokens.push(...userData.supplierCategories);
    }
    if (Array.isArray(userData.categories)) {
      categoryTokens.push(...userData.categories);
    }
    
    if (categoryTokens.length === 0) {
      skipped++;
      continue;
    }
    
    // Normalize to IDs
    const categoryIds = normalizeToIds(categoryTokens);
    
    if (categoryIds.length === 0) {
      console.warn(`⚠️ Could not normalize categories for user ${userId}:`, categoryTokens);
      errors++;
      continue;
    }
    
    // Prepare update
    const updateData = {
      supplierCategoryIds: categoryIds
    };
    
    // Log change
    const categoryNames = categoryIds.map(id => getNameById(id));
    console.log(`✅ User ${userId}:`, {
      old: categoryTokens,
      new: categoryIds,
      names: categoryNames
    });
    
    if (dryRun) {
      updated++;
    } else {
      // Add to batch
      const userRef = doc(db, 'users', userId);
      currentBatch.update(userRef, updateData);
      batchCount++;
      updated++;
      
      // Commit batch if full
      if (batchCount >= batchSize) {
        await currentBatch.commit();
        console.log(`💾 Committed batch of ${batchCount} updates`);
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    }
  }
  
  // Commit remaining batch
  if (!dryRun && batchCount > 0) {
    await currentBatch.commit();
    console.log(`💾 Committed final batch of ${batchCount} updates`);
  }
  
  console.log(`\n📊 Supplier Migration Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
  
  return { processed, updated, skipped, errors };
}

/**
 * Migrate demands collection
 */
async function migrateDemands() {
  console.log('\n📦 Starting demand migration...');
  
  const demandsRef = collection(db, 'demands');
  const snapshot = await getDocs(demandsRef);
  
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Process in batches of 500
  const batchSize = 500;
  let currentBatch = writeBatch(db);
  let batchCount = 0;
  
  for (const demandDoc of snapshot.docs) {
    processed++;
    const demandData = demandDoc.data();
    const demandId = demandDoc.id;
    
    // Skip if already has categoryIds
    if (Array.isArray(demandData.categoryIds) && demandData.categoryIds.length > 0) {
      skipped++;
      continue;
    }
    
    // Collect all category tokens
    const categoryTokens = [];
    
    // Add legacy formats
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
    
    if (categoryTokens.length === 0) {
      skipped++;
      continue;
    }
    
    // Normalize to IDs
    const categoryIds = normalizeToIds(categoryTokens);
    
    if (categoryIds.length === 0) {
      console.warn(`⚠️ Could not normalize categories for demand ${demandId}:`, categoryTokens);
      errors++;
      continue;
    }
    
    // Prepare update
    const updateData = {
      categoryIds: categoryIds
    };
    
    // Log change
    const categoryNames = categoryIds.map(id => getNameById(id));
    console.log(`✅ Demand ${demandId}:`, {
      old: categoryTokens,
      new: categoryIds,
      names: categoryNames
    });
    
    if (dryRun) {
      updated++;
    } else {
      // Add to batch
      const demandRef = doc(db, 'demands', demandId);
      currentBatch.update(demandRef, updateData);
      batchCount++;
      updated++;
      
      // Commit batch if full
      if (batchCount >= batchSize) {
        await currentBatch.commit();
        console.log(`💾 Committed batch of ${batchCount} updates`);
        currentBatch = writeBatch(db);
        batchCount = 0;
      }
    }
  }
  
  // Commit remaining batch
  if (!dryRun && batchCount > 0) {
    await currentBatch.commit();
    console.log(`💾 Committed final batch of ${batchCount} updates`);
  }
  
  console.log(`\n📊 Demand Migration Summary:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
  
  return { processed, updated, skipped, errors };
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting category migration to ID-based system...\n');
  
  try {
    // Migrate suppliers
    const supplierStats = await migrateSuppliers();
    
    // Migrate demands
    const demandStats = await migrateDemands();
    
    // Final summary
    console.log('\n✅ Migration completed!');
    console.log('\n📊 Final Summary:');
    console.log(`   Suppliers: ${supplierStats.updated} updated, ${supplierStats.skipped} skipped`);
    console.log(`   Demands: ${demandStats.updated} updated, ${demandStats.skipped} skipped`);
    console.log(`   Total errors: ${supplierStats.errors + demandStats.errors}`);
    
    if (dryRun) {
      console.log('\n💡 This was a DRY-RUN. Run with --commit to apply changes.');
    } else {
      console.log('\n✅ Changes have been committed to Firestore.');
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
runMigration();

