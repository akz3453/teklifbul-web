#!/usr/bin/env node

/**
 * Backfill script to generate SATFK for existing demands
 * Usage: node scripts/backfill-satfk.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    // Try to use service account key if available
    const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'teklifbul'
    });
  } catch (error) {
    console.log('Service account key not found, using application default credentials');
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: 'teklifbul'
    });
  }
}

const db = admin.firestore();

/**
 * Generate SATFK for a demand
 * @param {Object} demandData - Demand document data
 * @param {string} demandId - Demand document ID
 * @returns {Promise<string>} Generated SATFK
 */
async function generateSATFK(demandData, demandId) {
  try {
    // Get creation date
    let creationDate;
    if (demandData.createdAt && demandData.createdAt.toDate) {
      creationDate = demandData.createdAt.toDate();
    } else if (demandData.createdAt && demandData.createdAt._seconds) {
      creationDate = new Date(demandData.createdAt._seconds * 1000);
    } else {
      creationDate = new Date();
    }

    // Format date as YYYYMMDD
    const dateStr = creationDate.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get daily counter
    const counterRef = db.collection('counters').doc(`demandCode_${dateStr}`);
    
    const satfk = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      const currentCount = counterDoc.exists ? (counterDoc.data()?.count || 0) : 0;
      const newCount = currentCount + 1;
      
      // Convert to Base36 and pad to 3-4 characters
      const base36 = newCount.toString(36).toUpperCase();
      const padded = base36.padStart(3, '0');
      
      // Update counter
      transaction.set(counterRef, { count: newCount }, { merge: true });
      
      // Generate SATFK
      return `SATFK-${dateStr}-${padded}`;
    });

    return satfk;
  } catch (error) {
    console.error(`Error generating SATFK for demand ${demandId}:`, error);
    throw error;
  }
}

/**
 * Main backfill function
 */
async function backfillSATFK() {
  console.log('🚀 Starting SATFK backfill process...');
  
  try {
    // Get all demands without SATFK
    const demandsQuery = db.collection('demands')
      .where('satfk', '==', null);
    
    const demandsSnap = await demandsQuery.get();
    
    if (demandsSnap.empty) {
      console.log('✅ No demands found without SATFK');
      return;
    }
    
    console.log(`📊 Found ${demandsSnap.size} demands without SATFK`);
    
    let processed = 0;
    let errors = 0;
    
    // Process demands in batches
    const batchSize = 10;
    const demands = demandsSnap.docs;
    
    for (let i = 0; i < demands.length; i += batchSize) {
      const batch = demands.slice(i, i + batchSize);
      
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(demands.length / batchSize)}`);
      
      const promises = batch.map(async (doc) => {
        try {
          const demandData = doc.data();
          const demandId = doc.id;
          
          // Skip if SATFK already exists
          if (demandData.satfk) {
            console.log(`⏭️  Skipping demand ${demandId} - already has SATFK: ${demandData.satfk}`);
            return;
          }
          
          // Generate SATFK
          const satfk = await generateSATFK(demandData, demandId);
          
          // Update demand with SATFK
          await doc.ref.update({ satfk });
          
          console.log(`✅ Updated demand ${demandId} with SATFK: ${satfk}`);
          processed++;
          
        } catch (error) {
          console.error(`❌ Error processing demand ${doc.id}:`, error);
          errors++;
        }
      });
      
      await Promise.all(promises);
      
      // Small delay between batches to avoid overwhelming Firestore
      if (i + batchSize < demands.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('🎉 Backfill completed!');
    console.log(`📊 Processed: ${processed} demands`);
    console.log(`❌ Errors: ${errors} demands`);
    
  } catch (error) {
    console.error('💥 Backfill failed:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillSATFK()
  .then(() => {
    console.log('✅ Backfill script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Backfill script failed:', error);
    process.exit(1);
  });
