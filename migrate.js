#!/usr/bin/env node

/**
 * Migration Script: Fix Users Added to Companies Without Approval
 * 
 * This script fixes users who were mistakenly added to companies without proper approval.
 * It moves them to a pending state and ensures companyJoinRequests are properly created.
 * 
 * Usage:
 *   node migrate.js          # Dry-run mode (default, only logs actions)
 *   node migrate.js --apply   # Actually apply changes
 * 
 * Prerequisites:
 *   1. Install dependencies: npm install firebase-admin
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS environment variable:
 *      export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
 *   3. Ensure service account has Firestore read/write permissions
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Configuration
const BATCH_SIZE = 500; // Firestore batch limit
const DRY_RUN = !process.argv.includes('--apply');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    // Try to initialize with default credentials (from GOOGLE_APPLICATION_CREDENTIALS)
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    console.log('✅ Firebase Admin initialized with default credentials');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('\nPlease ensure:');
    console.error('1. GOOGLE_APPLICATION_CREDENTIALS environment variable is set');
    console.error('2. Service account key file exists and is valid');
    console.error('3. Service account has Firestore read/write permissions');
    process.exit(1);
  }
}

const db = admin.firestore();

// Statistics
const stats = {
  numberFixed: 0,           // Users moved to pending state
  numberLeftAsIs: 0,        // Users already properly approved
  numberCreatedRequests: 0, // companyJoinRequests created
  numberErrors: 0           // Errors encountered
};

/**
 * Get company code from companyId
 * If companyCode is not found, return companyId as fallback
 */
async function getCompanyCode(companyId) {
  try {
    const companyDoc = await db.collection('companies').doc(companyId).get();
    if (companyDoc.exists) {
      const companyData = companyDoc.data();
      return companyData.code || companyId; // Fallback to companyId if code not found
    }
    return companyId; // Fallback if company doesn't exist
  } catch (error) {
    console.warn(`⚠️  Error fetching company ${companyId}:`, error.message);
    return companyId; // Fallback on error
  }
}

/**
 * Find all pending companyJoinRequests for a user
 */
async function findPendingRequests(userId) {
  try {
    const requestsQuery = await db.collection('companyJoinRequests')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    return requestsQuery.docs;
  } catch (error) {
    console.warn(`⚠️  Error fetching pending requests for user ${userId}:`, error.message);
    return [];
  }
}

/**
 * Find all accepted companyJoinRequests for a user
 */
async function findAcceptedRequests(userId) {
  try {
    const requestsQuery = await db.collection('companyJoinRequests')
      .where('userId', '==', userId)
      .where('status', '==', 'accepted')
      .get();
    return requestsQuery.docs;
  } catch (error) {
    console.warn(`⚠️  Error fetching accepted requests for user ${userId}:`, error.message);
    return [];
  }
}

/**
 * Process a single user
 */
async function processUser(userDoc) {
  const userId = userDoc.id;
  const userData = userDoc.data();
  
  // Skip users without companyId
  if (!userData.companyId) {
    return { action: 'skipped', reason: 'no companyId' };
  }
  
  const companyId = userData.companyId;
  
  // Check for pending requests
  const pendingRequests = await findPendingRequests(userId);
  
  // Check for accepted requests
  const acceptedRequests = await findAcceptedRequests(userId);
  
  // Case 1: User has companyId AND pending companyJoinRequests
  // → Remove companyId, set companyJoinStatus = "pending", ensure exactly one request exists
  if (pendingRequests.length > 0) {
    const actions = [];
    
    // Remove companyId from user document
    const userRef = db.collection('users').doc(userId);
    const userUpdate = {
      companyJoinStatus: 'pending'
    };
    
    // Remove companyId field (use FieldValue.delete() in Firestore)
    if (!DRY_RUN) {
      userUpdate.companyId = admin.firestore.FieldValue.delete();
    }
    
    actions.push({
      type: 'update',
      ref: userRef,
      data: userUpdate,
      description: `Remove companyId and set companyJoinStatus='pending' for user ${userId}`
    });
    
    // Ensure exactly one companyJoinRequests doc exists
    if (pendingRequests.length === 1) {
      // Perfect - exactly one request exists, no action needed
      // Just update the user document (already added to actions above)
    } else if (pendingRequests.length > 1) {
      // Multiple requests exist, keep the first one, delete others
      console.log(`  ⚠️  User ${userId} has ${pendingRequests.length} pending requests, keeping first, deleting others`);
      for (let i = 1; i < pendingRequests.length; i++) {
        if (!DRY_RUN) {
          actions.push({
            type: 'delete',
            ref: pendingRequests[i].ref,
            description: `Delete duplicate pending request ${pendingRequests[i].id}`
          });
        } else {
          console.log(`  📝 Would delete duplicate pending request ${pendingRequests[i].id}`);
        }
      }
    }
    
    stats.numberFixed++;
    return { action: 'fixed', actions };
  }
  
  // Case 2: User has companyId AND accepted companyJoinRequests
  // → Leave as-is (already approved)
  if (acceptedRequests.length > 0) {
    stats.numberLeftAsIs++;
    return { action: 'left_as_is', reason: 'has accepted request' };
  }
  
  // Case 3: User has companyJoinStatus == "accepted" but no matching companyJoinRequests
  // → Create an accepted request doc (to keep records consistent)
  if (userData.companyJoinStatus === 'accepted') {
    const companyCode = await getCompanyCode(companyId);
    const requestedRole = userData.requestedRole || userData.requestedCompanyRole || 'unknown';
    const requestedCompanyRole = userData.requestedCompanyRole || userData.companyRoleKey || userData.requestedRole || 'unknown';
    
    const requestData = {
      userId: userId,
      userEmail: userData.email || '',
      companyCode: companyCode,
      companyId: companyId,
      requestedRole: requestedRole.includes('supplier') ? 'supplier' : 'buyer',
      requestedCompanyRole: requestedCompanyRole,
      status: 'accepted',
      approvedRole: userData.companyRoleKey || requestedCompanyRole,
      approvedAt: userData.approvedAt || userData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp()
    };
    
    const actions = [];
    if (!DRY_RUN) {
      actions.push({
        type: 'create',
        ref: db.collection('companyJoinRequests'),
        data: requestData,
        description: `Create accepted companyJoinRequest for user ${userId} (backfill)`
      });
    } else {
      console.log(`  📝 Would create accepted companyJoinRequest:`, requestData);
    }
    
    stats.numberCreatedRequests++;
    return { action: 'created_request', actions };
  }
  
  // Case 4: User has companyId but no requests and companyJoinStatus != "accepted"
  // → This is the main case we're fixing - create pending request and set status
  const companyCode = await getCompanyCode(companyId);
  const requestedRole = userData.requestedRole || userData.requestedCompanyRole || 'unknown';
  const requestedCompanyRole = userData.requestedCompanyRole || userData.requestedRole || 'unknown';
  
  const userRef = db.collection('users').doc(userId);
  const userUpdate = {
    companyJoinStatus: 'pending'
  };
  
  if (!DRY_RUN) {
    userUpdate.companyId = admin.firestore.FieldValue.delete();
  }
  
  const requestData = {
    userId: userId,
    userEmail: userData.email || '',
    companyCode: companyCode,
    companyId: companyId,
    requestedRole: requestedRole.includes('supplier') ? 'supplier' : 'buyer',
    requestedCompanyRole: requestedCompanyRole,
    status: 'pending',
    createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp()
  };
  
  const actions = [];
  actions.push({
    type: 'update',
    ref: userRef,
    data: userUpdate,
    description: `Remove companyId and set companyJoinStatus='pending' for user ${userId}`
  });
  
  if (!DRY_RUN) {
    actions.push({
      type: 'create',
      ref: db.collection('companyJoinRequests'),
      data: requestData,
      description: `Create pending companyJoinRequest for user ${userId}`
    });
  } else {
    console.log(`  📝 Would create companyJoinRequest:`, requestData);
  }
  
  stats.numberFixed++;
  stats.numberCreatedRequests++;
  return { action: 'fixed', actions };
}

/**
 * Execute batch writes
 */
async function executeBatch(writes) {
  if (writes.length === 0) return;
  
  // Firestore batch limit is 500
  const batches = [];
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    batches.push(writes.slice(i, i + BATCH_SIZE));
  }
  
  for (const batch of batches) {
    const firestoreBatch = db.batch();
    let batchCount = 0;
    
    for (const write of batch) {
      try {
        if (write.type === 'update') {
          firestoreBatch.update(write.ref, write.data);
          batchCount++;
        } else if (write.type === 'create') {
          firestoreBatch.set(write.ref, write.data);
          batchCount++;
        } else if (write.type === 'delete') {
          firestoreBatch.delete(write.ref);
          batchCount++;
        }
      } catch (error) {
        console.error(`❌ Error adding write to batch:`, error.message);
        stats.numberErrors++;
      }
    }
    
    if (batchCount > 0 && !DRY_RUN) {
      try {
        await firestoreBatch.commit();
        console.log(`✅ Committed batch of ${batchCount} writes`);
      } catch (error) {
        console.error(`❌ Error committing batch:`, error.message);
        stats.numberErrors++;
        // Retry logic could be added here
      }
    } else if (DRY_RUN && batchCount > 0) {
      console.log(`📝 [DRY-RUN] Would commit batch of ${batchCount} writes`);
    }
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('\n🚀 Starting migration...');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY-RUN (no changes will be made)' : '✏️  APPLY (changes will be written)'}\n`);
  
  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN mode: No changes will be written to Firestore');
    console.log('   Run with --apply flag to actually apply changes\n');
  } else {
    // Confirm before applying
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('⚠️  You are about to modify Firestore data. Continue? (yes/no): ', resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Migration cancelled');
      process.exit(0);
    }
  }
  
  try {
    // Fetch all users with companyId
    console.log('📖 Fetching users with companyId...');
    const usersSnapshot = await db.collection('users')
      .where('companyId', '!=', null)
      .get();
    
    console.log(`✅ Found ${usersSnapshot.size} users with companyId\n`);
    
    if (usersSnapshot.size === 0) {
      console.log('✅ No users to migrate');
      return;
    }
    
    // Process users in batches to avoid memory issues
    const allWrites = [];
    let processed = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      processed++;
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      if (processed % 100 === 0) {
        console.log(`📊 Processed ${processed}/${usersSnapshot.size} users...`);
      }
      
      try {
        const result = await processUser(userDoc);
        
        if (result.actions && result.actions.length > 0) {
          allWrites.push(...result.actions);
          
          if (DRY_RUN) {
            console.log(`\n👤 User ${userId} (${userData.email || 'no email'}):`);
            result.actions.forEach(action => {
              console.log(`  ${action.description}`);
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error processing user ${userId}:`, error.message);
        stats.numberErrors++;
      }
    }
    
    console.log(`\n✅ Processed all ${usersSnapshot.size} users\n`);
    
    // Execute all writes
    if (allWrites.length > 0) {
      console.log(`📝 Executing ${allWrites.length} writes...`);
      await executeBatch(allWrites);
      console.log('✅ All writes completed\n');
    } else {
      console.log('✅ No writes needed\n');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    stats.numberErrors++;
    throw error;
  }
}

/**
 * Print summary statistics
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Users fixed (moved to pending):     ${stats.numberFixed}`);
  console.log(`✅ Users left as-is (already approved): ${stats.numberLeftAsIs}`);
  console.log(`✅ Join requests created:                ${stats.numberCreatedRequests}`);
  console.log(`❌ Errors encountered:                   ${stats.numberErrors}`);
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY-RUN. No changes were made.');
    console.log('   Run with --apply flag to actually apply changes.');
  } else {
    console.log('\n✅ Migration completed successfully!');
  }
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  try {
    await migrate();
    printSummary();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    printSummary();
    process.exit(1);
  }
}

// Run the migration
main();

