#!/usr/bin/env node

/**
 * Migration Script: Fix Users Added to Companies Without Approval
 * 
 * This script fixes users who were mistakenly added to companies without proper approval.
 * It moves them to a pending state and ensures companyJoinRequests are properly created.
 * 
 * Behavior:
 * - For users with companyId but companyJoinStatus !== 'accepted':
 *   - If pending request exists: remove companyId, set companyJoinStatus='pending'
 *   - If NO request exists: create pending request, remove companyId, set companyJoinStatus='pending'
 *   - If accepted request exists: leave as-is
 * 
 * Usage:
 *   node migrate_fix_company_join.js          # Dry-run mode (default)
 *   node migrate_fix_company_join.js --apply  # Apply changes
 * 
 * Prerequisites:
 *   1. npm install firebase-admin
 *   2. Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 *   3. Service account must have Firestore read/write permissions
 */

const admin = require('firebase-admin');
const readline = require('readline');

const BATCH_SIZE = 500;
const DRY_RUN = !process.argv.includes('--apply');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Failed to initialize:', error.message);
    process.exit(1);
  }
}

const db = admin.firestore();

const stats = {
  numberChecked: 0,
  numberFixed: 0,
  numberLeftAsIs: 0,
  numberRequestsCreated: 0,
  numberErrors: 0
};

/**
 * Get company code from companyId
 */
async function getCompanyCode(companyId) {
  try {
    const companyDoc = await db.collection('companies').doc(companyId).get();
    if (companyDoc.exists) {
      return companyDoc.data().code || companyId;
    }
    return companyId;
  } catch (error) {
    return companyId;
  }
}

/**
 * Find pending requests for a user
 */
async function findPendingRequests(userId) {
  try {
    const query = await db.collection('companyJoinRequests')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    return query.docs;
  } catch (error) {
    return [];
  }
}

/**
 * Find accepted requests for a user
 */
async function findAcceptedRequests(userId) {
  try {
    const query = await db.collection('companyJoinRequests')
      .where('userId', '==', userId)
      .where('status', '==', 'accepted')
      .get();
    return query.docs;
  } catch (error) {
    return [];
  }
}

/**
 * Process a single user
 */
async function processUser(userDoc) {
  const userId = userDoc.id;
  const userData = userDoc.data();
  
  stats.numberChecked++;
  
  if (!userData.companyId) {
    return { action: 'skipped', reason: 'no companyId' };
  }
  
  const companyId = userData.companyId;
  const companyJoinStatus = userData.companyJoinStatus;
  
  // If already accepted, check if there's an accepted request
  if (companyJoinStatus === 'accepted' || companyJoinStatus === 'approved') {
    const acceptedRequests = await findAcceptedRequests(userId);
    if (acceptedRequests.length > 0) {
      stats.numberLeftAsIs++;
      return { action: 'left_as_is', reason: 'already approved with request' };
    }
    // If accepted but no request, we'll create one (backfill)
  }
  
  // Check for pending requests
  const pendingRequests = await findPendingRequests(userId);
  
  // Check for accepted requests
  const acceptedRequests = await findAcceptedRequests(userId);
  
  // Case 1: Has accepted request - leave as-is
  if (acceptedRequests.length > 0) {
    stats.numberLeftAsIs++;
    return { action: 'left_as_is', reason: 'has accepted request' };
  }
  
  // Case 2: Has pending request - remove companyId, set pending
  if (pendingRequests.length > 0) {
    const actions = [];
    const userRef = db.collection('users').doc(userId);
    
    const userUpdate = {
      companyJoinStatus: 'pending',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (!DRY_RUN) {
      userUpdate.companyId = admin.firestore.FieldValue.delete();
    }
    
    actions.push({
      type: 'update',
      ref: userRef,
      data: userUpdate,
      description: `Remove companyId and set pending for user ${userId}`
    });
    
    stats.numberFixed++;
    return { action: 'fixed', actions };
  }
  
  // Case 3: No request exists - create one and set pending
  const companyCode = await getCompanyCode(companyId);
  const requestedRole = userData.requestedCompanyRole || userData.requestedRole || 'unknown';
  const requestedRoleType = requestedRole.includes('supplier') ? 'supplier' : 'buyer';
  
  const actions = [];
  
  // Update user
  const userRef = db.collection('users').doc(userId);
  const userUpdate = {
    companyJoinStatus: 'pending',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  if (!DRY_RUN) {
    userUpdate.companyId = admin.firestore.FieldValue.delete();
  }
  
  actions.push({
    type: 'update',
    ref: userRef,
    data: userUpdate,
    description: `Remove companyId and set pending for user ${userId}`
  });
  
  // Create request
  const requestData = {
    userId: userId,
    userEmail: userData.email || '',
    companyCode: companyCode,
    companyId: companyId,
    requestedRole: requestedRoleType,
    requestedCompanyRole: requestedRole,
    status: 'pending',
    createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp()
  };
  
  if (!DRY_RUN) {
    actions.push({
      type: 'create',
      ref: db.collection('companyJoinRequests'),
      data: requestData,
      description: `Create pending request for user ${userId}`
    });
  } else {
    console.log(`  📝 Would create request:`, requestData);
  }
  
  stats.numberFixed++;
  stats.numberRequestsCreated++;
  return { action: 'fixed', actions };
}

/**
 * Execute batch writes
 */
async function executeBatch(writes) {
  if (writes.length === 0) return;
  
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
          const newRef = db.collection('companyJoinRequests').doc();
          firestoreBatch.set(newRef, write.data);
          batchCount++;
        }
      } catch (error) {
        console.error(`❌ Error adding write:`, error.message);
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
      }
    } else if (DRY_RUN && batchCount > 0) {
      console.log(`📝 [DRY-RUN] Would commit batch of ${batchCount} writes`);
    }
  }
}

/**
 * Main migration
 */
async function migrate() {
  console.log('\n🚀 Starting migration...');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY-RUN' : '✏️  APPLY'}\n`);
  
  if (!DRY_RUN) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('⚠️  Continue? (yes/no): ', resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled');
      process.exit(0);
    }
  }
  
  try {
    console.log('📖 Fetching users with companyId...');
    const usersSnapshot = await db.collection('users')
      .where('companyId', '!=', null)
      .get();
    
    console.log(`✅ Found ${usersSnapshot.size} users\n`);
    
    if (usersSnapshot.size === 0) {
      console.log('✅ No users to migrate');
      return;
    }
    
    const allWrites = [];
    let processed = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      processed++;
      if (processed % 100 === 0) {
        console.log(`📊 Processed ${processed}/${usersSnapshot.size}...`);
      }
      
      try {
        const result = await processUser(userDoc);
        if (result.actions && result.actions.length > 0) {
          allWrites.push(...result.actions);
        }
      } catch (error) {
        console.error(`❌ Error processing user ${userDoc.id}:`, error.message);
        stats.numberErrors++;
      }
    }
    
    console.log(`\n✅ Processed all ${usersSnapshot.size} users\n`);
    
    if (allWrites.length > 0) {
      console.log(`📝 Executing ${allWrites.length} writes...`);
      await executeBatch(allWrites);
      console.log('✅ All writes completed\n');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    stats.numberErrors++;
    throw error;
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Users checked:              ${stats.numberChecked}`);
  console.log(`✅ Users fixed:                ${stats.numberFixed}`);
  console.log(`✅ Users left as-is:           ${stats.numberLeftAsIs}`);
  console.log(`✅ Requests created:           ${stats.numberRequestsCreated}`);
  console.log(`❌ Errors:                     ${stats.numberErrors}`);
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY-RUN mode. Run with --apply to apply changes.');
  } else {
    console.log('\n✅ Migration completed!');
  }
  console.log('');
}

/**
 * Main
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

main();

