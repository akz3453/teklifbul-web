#!/usr/bin/env node

/**
 * Simple SATFK generator for existing demands
 * This script generates SATFK codes for demands that don't have them
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, updateDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE",
  authDomain: "teklifbul.firebaseapp.com",
  projectId: "teklifbul",
  storageBucket: "teklifbul.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Generate SATFK for a demand
 */
function generateSATFK(demandData, demandId) {
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
  
  // Generate a simple counter based on demand ID hash
  const hash = demandId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const counter = Math.abs(hash) % 1000; // 0-999
  const base36 = counter.toString(36).toUpperCase();
  const padded = base36.padStart(3, '0');
  
  return `SATFK-${dateStr}-${padded}`;
}

/**
 * Main function to add SATFK to demands
 */
async function addSATFKToDemands() {
  console.log('🚀 Starting SATFK addition process...');
  
  try {
    // Get all demands
    const demandsRef = collection(db, 'demands');
    const snapshot = await getDocs(demandsRef);
    
    console.log(`📊 Found ${snapshot.docs.length} total demands`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const docSnap of snapshot.docs) {
      const demandData = docSnap.data();
      const demandId = docSnap.id;
      
      // Skip if SATFK already exists
      if (demandData.satfk) {
        console.log(`⏭️ Skipping ${demandId} - already has SATFK: ${demandData.satfk}`);
        skippedCount++;
        continue;
      }
      
      try {
        // Generate SATFK
        const satfk = generateSATFK(demandData, demandId);
        
        // Update the demand
        await updateDoc(doc(db, 'demands', demandId), {
          satfk: satfk
        });
        
        console.log(`✅ Updated ${demandId} with SATFK: ${satfk}`);
        updatedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to update ${demandId}:`, error);
      }
    }
    
    console.log(`\n📈 Summary:`);
    console.log(`   - Updated: ${updatedCount} demands`);
    console.log(`   - Skipped: ${skippedCount} demands`);
    console.log(`   - Total: ${snapshot.docs.length} demands`);
    
  } catch (error) {
    console.error('💥 Process failed:', error);
  }
}

// Run the process
addSATFKToDemands()
  .then(() => {
    console.log('✅ SATFK addition completed successfully');
  })
  .catch((error) => {
    console.error('💥 SATFK addition failed:', error);
  });
