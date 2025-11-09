#!/usr/bin/env node

/**
 * Backfill script to normalize existing category data
 * Converts category names to slug format for both demands and users
 */

const admin = require('firebase-admin');
const readline = require('readline');
/* eslint-disable @typescript-eslint/no-require-imports */

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

/**
 * Convert category names to slugs
 * @param {string} name - Category name to convert
 * @returns {string} Slugified category name
 */
function toSlug(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Backfill demand categories
 */
async function backfillDemandCategories() {
  console.log('🔄 Starting demand categories backfill...');
  
  try {
    const demandsSnapshot = await db.collection('demands').get();
    let processed = 0;
    let updated = 0;
    const batch = db.batch();

    for (const doc of demandsSnapshot.docs) {
      const data = doc.data();
      const categories = data.categories || [];
      const normalizedCategories = categories.map(toSlug).filter(Boolean);

      if (JSON.stringify(normalizedCategories) !== JSON.stringify(categories)) {
        const demandRef = db.collection('demands').doc(doc.id);
        batch.update(demandRef, { categories: normalizedCategories });
        updated++;
        console.log(`📝 Will update demand ${doc.id}:`, {
          from: categories,
          to: normalizedCategories
        });
      }
      processed++;

      // Commit batch every 500 operations
      if (updated > 0 && updated % 500 === 0) {
        await batch.commit();
        console.log(`✅ Committed batch: ${updated} demands updated`);
      }
    }

    // Commit remaining operations
    if (updated > 0) {
      await batch.commit();
    }

    console.log(`✅ Demand categories backfill completed: ${updated}/${processed} demands updated`);
  } catch (error) {
    console.error('❌ Error backfilling demand categories:', error);
    throw error;
  }
}

/**
 * Backfill supplier categories
 */
async function backfillSupplierCategories() {
  console.log('🔄 Starting supplier categories backfill...');
  
  try {
    const usersSnapshot = await db.collection('users')
      .where('isSupplier', '==', true)
      .get();
    
    let processed = 0;
    let updated = 0;
    const batch = db.batch();

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const supplierCategories = data.supplierCategories || [];
      const normalizedCategories = supplierCategories.map(toSlug).filter(Boolean);

      if (JSON.stringify(normalizedCategories) !== JSON.stringify(supplierCategories)) {
        const userRef = db.collection('users').doc(doc.id);
        batch.update(userRef, { supplierCategories: normalizedCategories });
        updated++;
        console.log(`📝 Will update supplier ${doc.id}:`, {
          from: supplierCategories,
          to: normalizedCategories
        });
      }
      processed++;

      // Commit batch every 500 operations
      if (updated > 0 && updated % 500 === 0) {
        await batch.commit();
        console.log(`✅ Committed batch: ${updated} suppliers updated`);
      }
    }

    // Commit remaining operations
    if (updated > 0) {
      await batch.commit();
    }

    console.log(`✅ Supplier categories backfill completed: ${updated}/${processed} suppliers updated`);
  } catch (error) {
    console.error('❌ Error backfilling supplier categories:', error);
    throw error;
  }
}

/**
 * Main backfill function
 */
async function main() {
  console.log('🚀 Starting category normalization backfill...');
  console.log('This will normalize category names to slug format for all demands and suppliers.');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise((resolve) => {
    rl.question('Do you want to continue? (y/N): ', resolve);
  });
  
  rl.close();

  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('❌ Backfill cancelled by user');
    process.exit(0);
  }

  try {
    await backfillDemandCategories();
    await backfillSupplierCategories();
    console.log('🎉 All backfill operations completed successfully!');
  } catch (error) {
    console.error('💥 Backfill failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  backfillDemandCategories,
  backfillSupplierCategories,
  toSlug
};
