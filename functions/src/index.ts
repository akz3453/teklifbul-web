import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Utility function to convert category names to slugs
 * @param name - Category name to convert
 * @returns Slugified category name
 */
function toSlug(name: string): string {
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
 * Generate SATFK for new demands
 * Triggered on create to /demands/{id}
 */
export const generateSATFK = functions.firestore
  .document('demands/{id}')
  .onCreate(async (snap) => {
    const demandData = snap.data();
    
    // Skip if SATFK already exists
    if (demandData.satfk) {
      console.log(`Demand ${snap.id} already has SATFK: ${demandData.satfk}`);
      return;
    }

    try {
      // Get creation date
      let creationDate: Date;
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
      const counterRef = admin.firestore().collection('counters').doc(`demandCode_${dateStr}`);
      
      const satfk = await admin.firestore().runTransaction(async (transaction) => {
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

      // Update demand with SATFK
      await snap.ref.update({ satfk });
      
      console.log(`Generated SATFK for demand ${snap.id}: ${satfk}`);
      
    } catch (error) {
      console.error(`Error generating SATFK for demand ${snap.id}:`, error);
    }
  });

/**
 * Backfill missing SATFK codes for existing demands
 * Can be triggered manually or periodically
 */
export const backfillMissingSATFK = functions.https.onRequest(async (req, res) => {
  // Only allow authenticated users to trigger this
  if (!req.auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Get all demands without SATFK
    const demandsRef = admin.firestore().collection('demands');
    const query = demandsRef.where('satfk', '==', null).limit(100);
    const snapshot = await query.get();

    if (snapshot.empty) {
      res.json({ message: 'No demands without SATFK found' });
      return;
    }

    console.log(`Found ${snapshot.size} demands without SATFK`);

    // Process each demand
    const batch = admin.firestore().batch();
    let processedCount = 0;

    for (const doc of snapshot.docs) {
      const demandData = doc.data();
      
      // Get creation date
      let creationDate: Date;
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
      const counterRef = admin.firestore().collection('counters').doc(`demandCode_${dateStr}`);
      
      const satfk = await admin.firestore().runTransaction(async (transaction) => {
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

      // Update demand with SATFK
      batch.update(doc.ref, { satfk });
      processedCount++;
      
      console.log(`Generated SATFK for demand ${doc.id}: ${satfk}`);
    }

    // Commit all updates
    await batch.commit();
    
    res.json({ 
      message: `Successfully processed ${processedCount} demands`,
      processedCount
    });
    
  } catch (error) {
    console.error('Error in backfillMissingSATFK:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Normalize demand categories to slug format
 * Triggered on write to /demands/{id}
 */
export const normalizeDemandCategories = functions.firestore
  .document('demands/{id}')
  .onWrite(async (change) => {
    const after = change.after.data();
    if (!after) return;

    const categories = after.categories || [];
    const normalizedCategories = categories.map(toSlug).filter(Boolean);

    // Only update if categories have changed
    if (JSON.stringify(normalizedCategories) !== JSON.stringify(categories)) {
      console.log(`Normalizing categories for demand ${change.after.id}:`, {
        from: categories,
        to: normalizedCategories
      });

      try {
        await change.after.ref.update({ categories: normalizedCategories });
        console.log(`Successfully normalized categories for demand ${change.after.id}`);
      } catch (error) {
        console.error(`Error normalizing categories for demand ${change.after.id}:`, error);
      }
    }
  });

/**
 * Normalize supplier categories to slug format
 * Triggered on write to /users/{uid}
 */
export const normalizeSupplierCategories = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change) => {
    const after = change.after.data();
    if (!after || !after.isSupplier) return;

    const supplierCategories = after.supplierCategories || [];
    const normalizedCategories = supplierCategories.map(toSlug).filter(Boolean);

    // Only update if categories have changed
    if (JSON.stringify(normalizedCategories) !== JSON.stringify(supplierCategories)) {
      console.log(`Normalizing supplier categories for user ${change.after.id}:`, {
        from: supplierCategories,
        to: normalizedCategories
      });

      try {
        await change.after.ref.update({ supplierCategories: normalizedCategories });
        console.log(`Successfully normalized supplier categories for user ${change.after.id}`);
      } catch (error) {
        console.error(`Error normalizing supplier categories for user ${change.after.id}:`, error);
      }
    }
  });

/**
 * Audit log for demand publish/unpublish changes
 * Triggered on write to /demands/{id}
 */
export const auditDemandChanges = functions.firestore
  .document('demands/{id}')
  .onWrite(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    
    if (!before || !after) return;

    const changes: any[] = [];
    
    // Check for isPublished changes
    if (before.isPublished !== after.isPublished) {
      changes.push({
        field: 'isPublished',
        from: before.isPublished,
        to: after.isPublished,
        actorUid: after.updatedBy || after.createdBy,
        demandId: change.after.id,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Check for visibility changes
    if (before.visibility !== after.visibility) {
      changes.push({
        field: 'visibility',
        from: before.visibility,
        to: after.visibility,
        actorUid: after.updatedBy || after.createdBy,
        demandId: change.after.id,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Write audit logs if there are changes
    if (changes.length > 0) {
      const batch = admin.firestore().batch();
      
      changes.forEach((change, index) => {
        const auditRef = admin.firestore().collection('auditLogs').doc();
        batch.set(auditRef, change);
      });

      try {
        await batch.commit();
        console.log(`Created ${changes.length} audit log entries for demand ${change.after.id}`);
      } catch (error) {
        console.error(`Error creating audit logs for demand ${change.after.id}:`, error);
      }
    }
  });

/**
 * Search demands by SATFK (startsWith search)
 * GET /searchBySATFK?code=...
 */
export const searchBySATFK = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const code = req.query.code as string;
  
  if (!code) {
    res.status(400).json({ error: 'Missing code parameter' });
    return;
  }

  try {
    // Validate SATFK format
    if (!code.match(/^SATFK-\d{8}-[0-9A-Z]+$/)) {
      res.status(400).json({ error: 'Invalid SATFK format' });
      return;
    }

    // Search for exact match first
    const exactQuery = admin.firestore()
      .collection('demands')
      .where('satfk', '==', code)
      .limit(1);
    
    const exactSnap = await exactQuery.get();
    
    if (!exactSnap.empty) {
      const demand = exactSnap.docs[0];
      res.json({
        type: 'exact',
        results: [{
          id: demand.id,
          ...demand.data()
        }]
      });
      return;
    }

    // If no exact match, search for prefix matches
    const prefixQuery = admin.firestore()
      .collection('demands')
      .where('satfk', '>=', code)
      .where('satfk', '<', code + '\uf8ff')
      .limit(10);
    
    const prefixSnap = await prefixQuery.get();
    
    const results = prefixSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      type: 'prefix',
      results
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
