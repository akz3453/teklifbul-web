import functions = require('firebase-functions/v1');
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
// Use v1-style runtime through functions API but cast to any where types diverge
import admin = require('firebase-admin');
// Import pure helper functions (no side effects)
import { buildSearchTokens, tokensChanged } from './lib/stockSearchTokens';
// Full Excel bid form generator (matching frontend exportSatfkBtn exactly)
import { generateFullBidFormExcel } from './lib/excelGenerator';
import { GCF_CORS_ORIGINS, applyGcfCors } from './allowed-origins';
import { uidBelongsToCompany } from './company-membership';
import { buildPublicProfilePayload } from './sync-public-profile';

// Cloud Run gen2: NODE_ENV çoğu zaman boş gelir — mock ödeme/e-fatura açılmasın
if (process.env.K_SERVICE && process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'production';
  if (!process.env.APP_VERSION) process.env.APP_VERSION = '1.0.1';
}

// Teklifbul Rule v1.0 — Ücretsiz AI (Groq) için Secret Manager
const groqApiKey = defineSecret('GROQ_API_KEY');
// Mevcut SM secret'ı bağla — değer oluşturma/değiştirme yok
const paymentWebhookSecret = defineSecret('PAYMENT_WEBHOOK_SECRET');

function getTransactionalFromAddress(): string | null {
  const sender = String(process.env.SENDER_EMAIL || '').trim();
  if (!sender || sender.toLowerCase().includes('onboarding@resend.dev')) {
    if (process.env.NODE_ENV === 'production') return null;
    return sender || null;
  }
  return sender.includes('<') ? sender : `Nefisoft <${sender}>`;
}

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
// Allow an explicit any cast at the runtime boundary: the project uses v1-style Cloud Functions API
export const generateSATFK = (functions as any).firestore.document('demands/{id}').onCreate(async (snap: admin.firestore.DocumentSnapshot) => {
  const demandData = snap.data();
  if (!demandData) return;

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
  const auth = (req as unknown as { auth?: { uid?: string } }).auth;
  if (!auth) {
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
// Allow an explicit any cast at the runtime boundary for v1-style trigger
export const normalizeDemandCategories = (functions as any).firestore.document('demands/{id}').onWrite(async (change: { before: admin.firestore.DocumentSnapshot; after: admin.firestore.DocumentSnapshot; params?: Record<string, unknown> }) => {
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
// Allow an explicit any cast at the runtime boundary for v1-style trigger
export const normalizeSupplierCategories = (functions as any).firestore.document('users/{uid}').onWrite(async (change: { before: admin.firestore.DocumentSnapshot; after: admin.firestore.DocumentSnapshot; params?: Record<string, unknown> }) => {
  const uid = change.after.id || change.before.id;
  const after = change.after.data() as Record<string, unknown> | undefined;
  const db = admin.firestore();
  const publicRef = db.collection('publicProfiles').doc(uid);

  if (!change.after.exists || !after) {
    try {
      await publicRef.delete();
    } catch (error) {
      console.error(`publicProfiles delete failed for ${uid}:`, error);
    }
    return;
  }

  const payload = buildPublicProfilePayload(after, admin.firestore.FieldValue.serverTimestamp());
  try {
    if (payload) {
      await publicRef.set(payload);
    } else {
      await publicRef.delete();
    }
  } catch (error) {
    console.error(`publicProfiles sync failed for ${uid}:`, error);
  }

  if (!after.isSupplier) return;

  const supplierCategories = Array.isArray(after.supplierCategories) ? after.supplierCategories : [];
  const normalizedCategories = supplierCategories.map((item) => toSlug(String(item || ''))).filter(Boolean);

  if (JSON.stringify(normalizedCategories) !== JSON.stringify(supplierCategories)) {
    console.log(`Normalizing supplier categories for user ${uid}:`, {
      from: supplierCategories,
      to: normalizedCategories
    });

    try {
      await change.after.ref.update({ supplierCategories: normalizedCategories });
      console.log(`Successfully normalized supplier categories for user ${uid}`);
    } catch (error) {
      console.error(`Error normalizing supplier categories for user ${uid}:`, error);
    }
  }
});

/**
 * Audit log for demand changes
 * Triggered on write to /demands/{id}
 *
 * Not: Eski auditDemandPublishChanges trigger'i kald\u0131r\u0131ld\u0131; publish/unpublish olaylar\u0131 da
 * a\u015fa\u011f\u0131daki auditDemandChanges i\u00e7indeki update bran\u015f\u0131nda yakalan\u0131yor.
 */
// Teklifbul Rule v1.0 - v1-style trigger boundary; explicit any cast intentional
export const auditDemandChanges = (functions as any).firestore.document('demands/{id}').onWrite(async (change: { before: admin.firestore.DocumentSnapshot; after: admin.firestore.DocumentSnapshot; params?: Record<string, unknown> }) => {
  const before = change.before.data();
  const after = change.after.data();

  // Handle deletion
  if (before && !after) {
    const auditRef = admin.firestore().collection('auditLogs').doc();
    await auditRef.set({
      entityType: 'demand',
      entityId: change.before.id,
      action: 'delete',
      actorUid: before.updatedBy || before.createdBy,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      companyId: before.creatorCompanyId
    });
    return;
  }

  // Handle creation
  if (!before && after) {
    const auditRef = admin.firestore().collection('auditLogs').doc();
    await auditRef.set({
      entityType: 'demand',
      entityId: change.after.id,
      action: 'create',
      actorUid: after.createdBy,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      companyId: after.creatorCompanyId
    });
    return;
  }

  if (!before || !after) return;

  const changes: Array<Record<string, unknown>> = [];

  // Check for status changes
  if (before.status !== after.status) {
    changes.push({
      entityType: 'demand',
      entityId: change.after.id,
      field: 'status',
      from: before.status,
      to: after.status,
      actorUid: after.updatedBy || after.createdBy,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      companyId: after.creatorCompanyId
    });
  }

  // Check for isPublished changes
  if (before.isPublished !== after.isPublished) {
    changes.push({
      entityType: 'demand',
      entityId: change.after.id,
      field: 'isPublished',
      from: before.isPublished,
      to: after.isPublished,
      actorUid: after.updatedBy || after.createdBy,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      companyId: after.creatorCompanyId
    });
  }

  if (changes.length > 0) {
    const batch = admin.firestore().batch();
    changes.forEach((c) => {
      const auditRef = admin.firestore().collection('auditLogs').doc();
      batch.set(auditRef, c);
    });
    await batch.commit();
  }
});

/**
 * Audit log for bid changes
 * Triggered on write to /bids/{id}
 */
export const auditBidChanges = (functions as any).firestore.document('bids/{id}').onWrite(async (change: { before: admin.firestore.DocumentSnapshot; after: admin.firestore.DocumentSnapshot; params?: Record<string, unknown> }) => {
  const before = change.before.data();
  const after = change.after.data();

  // Handle deletion
  if (before && !after) {
    const auditRef = admin.firestore().collection('auditLogs').doc();
    await auditRef.set({
      entityType: 'bid',
      entityId: change.before.id,
      action: 'delete',
      actorUid: before.createdBy || before.supplierId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      companyId: before.supplierCompanyId
    });
    return;
  }

  // Handle creation
  if (!before && after) {
    const auditRef = admin.firestore().collection('auditLogs').doc();
    await auditRef.set({
      entityType: 'bid',
      entityId: change.after.id,
      action: 'create',
      actorUid: after.createdBy || after.supplierId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      companyId: after.supplierCompanyId,
      demandId: after.demandId
    });
    return;
  }

  if (!before || !after) return;

  const changes: Array<Record<string, unknown>> = [];

  // Check for status changes
  if (before.status !== after.status) {
    changes.push({
      entityType: 'bid',
      entityId: change.after.id,
      field: 'status',
      from: before.status,
      to: after.status,
      actorUid: after.updatedBy || after.supplierId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      companyId: after.buyerCompanyId || after.supplierCompanyId
    });
  }

  // Check for price changes
  if (JSON.stringify(before.items) !== JSON.stringify(after.items)) {
    changes.push({
      entityType: 'bid',
      entityId: change.after.id,
      field: 'items',
      action: 'price_update',
      actorUid: after.updatedBy || after.supplierId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      companyId: after.supplierCompanyId
    });
  }

  if (changes.length > 0) {
    const batch = admin.firestore().batch();
    changes.forEach((c) => {
      const auditRef = admin.firestore().collection('auditLogs').doc();
      batch.set(auditRef, c);
    });
    await batch.commit();
  }
});

/**
 * Search demands by SATFK (startsWith search)
 * GET /searchBySATFK?code=...
 * Teklifbul Rule v1.0 — Auth zorunlu; tam doküman sızıntısı engellendi (minimal DTO)
 */
export const searchBySATFK = functions.https.onRequest(async (req, res) => {
  applyGcfCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  // Teklifbul Rule v1.0 — Auth zorunlu
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthenticated', message: 'Missing or invalid token' });
    return;
  }

  let uid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
    uid = decoded.uid;
  } catch (e) {
    res.status(401).json({ error: 'Unauthenticated', message: 'Invalid token' });
    return;
  }

  const code = req.query.code as string;

  if (!code) {
    res.status(400).json({ error: 'Missing code parameter' });
    return;
  }

  const toPublicDemandDto = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const d = doc.data() || {};
    return {
      id: doc.id,
      satfk: d.satfk || null,
      title: d.title || null,
      isPublished: d.isPublished === true,
      status: d.status || null,
      createdAt: d.createdAt || null,
    };
  };

  const userMaySeeDemand = async (data: FirebaseFirestore.DocumentData): Promise<boolean> => {
    if (data.isPublished === true) return true;
    if (data.createdBy === uid) return true;
    return uidBelongsToCompany(uid, data.creatorCompanyId);
  };

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
      const data = demand.data() || {};
      if (!(await userMaySeeDemand(data))) {
        res.status(404).json({ error: 'Not found', results: [] });
        return;
      }
      res.json({
        type: 'exact',
        results: [toPublicDemandDto(demand)]
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
    const results: ReturnType<typeof toPublicDemandDto>[] = [];
    for (const doc of prefixSnap.docs) {
      const data = doc.data() || {};
      if (await userMaySeeDemand(data)) {
        results.push(toPublicDemandDto(doc));
      }
    }

    res.json({
      type: 'prefix',
      results
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Generate searchTokens for stocks collection
 * Triggered on write to /stocks/{stockId}
 * Teklifbul Rule v1.0 - Firestore autocomplete: Generate search tokens
 */
// Allow an explicit any cast at the runtime boundary for v1-style trigger
export const generateStockSearchTokens = (functions as any).firestore.document('stocks/{stockId}').onWrite(async (change: { before: admin.firestore.DocumentSnapshot; after: admin.firestore.DocumentSnapshot; params?: Record<string, unknown> }) => {
  const after = change.after.data();
  if (!after) return; // Document deleted, nothing to do

  // Extract searchable fields
  const name = (after.name || '').toString();
  const sku = (after.sku || '').toString();
  const barcode = (after.barcode || '').toString();

  const searchTokens = buildSearchTokens(name, sku, barcode);

  if (searchTokens.length === 0) {
    console.log(`Skipping searchTokens generation for stock ${change.after.id}: no searchable text`);
    return;
  }

  // Check if tokens have changed (prevent infinite loop)
  const before = change.before.data();
  const existingTokens = before?.searchTokens || [];

  if (!tokensChanged(searchTokens, existingTokens) && before) {
    console.log(`SearchTokens unchanged for stock ${change.after.id}, skipping update`);
    return;
  }

  // Update only searchTokens and searchUpdatedAt
  try {
    await change.after.ref.update({
      searchTokens: searchTokens,
      searchUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Generated ${searchTokens.length} searchTokens for stock ${change.after.id}`);
  } catch (error) {
    console.error(`Error generating searchTokens for stock ${change.after.id}:`, error);
  }
});

/**
 * Send email notifications to additional suppliers when a demand is created
 * Now includes Excel attachment, bid submission link with token, and registration CTA
 */
export const sendDemandCreatedNotifications = (functions as any).firestore.document('demands/{id}').onCreate(async (snap: admin.firestore.DocumentSnapshot) => {
  const demandData = snap.data();
  if (!demandData) return;

  const { sendEmailOnNotification, supplierEmails, title, satfk, createdBy } = demandData;

  if (!sendEmailOnNotification || !supplierEmails || !Array.isArray(supplierEmails) || supplierEmails.length === 0) {
    console.log(`Skipping email notification for demand ${snap.id}: No emails or disabled.`);
    return;
  }

  // Teklifbul Rule v1.0 - Production'da env zorunlu, hardcoded fallback kaldirildi
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY env eksik - email gonderimi atlandi");
    return;
  }
  const fromAddress = getTransactionalFromAddress();
  if (!fromAddress) {
    console.error("SENDER_EMAIL production domain eksik - email gonderimi atlandi");
    return;
  }

  // Fetch demand items for Excel generation
  const itemsSnap = await admin.firestore().collection('demands').doc(snap.id).collection('items').orderBy("lineNo", "asc").get();
  const allItems = itemsSnap.docs.map(doc => doc.data());

  console.log(`Sending notifications to ${supplierEmails.length} recipients for demand ${snap.id}`);

  const emailPromises = supplierEmails.map(async (email: string) => {
    try {
      // Basic validation
      if (!email || !email.includes('@')) return;

      // 1. Get supplier's categories for filtering
      const userSnap = await admin.firestore().collection('users').where('email', '==', email.toLowerCase().trim()).limit(1).get();
      let supplierCategoryIds: string[] = [];
      if (!userSnap.empty) {
        const u = userSnap.docs[0].data();
        const ids = Array.isArray(u.supplierCategoryIds) ? u.supplierCategoryIds : [];
        const legacy = [...(Array.isArray(u.supplierCategoryKeys) ? u.supplierCategoryKeys : []), ...(Array.isArray(u.supplierCategories) ? u.supplierCategories : [])];
        const legacySlugs = legacy.map(c => typeof c === 'string' ? toSlug(c) : c).filter(Boolean);
        supplierCategoryIds = Array.from(new Set([...ids, ...legacySlugs]));
      }

      // 2. Filter items for THIS specific supplier
      let filteredItems = allItems;
      if (supplierCategoryIds.length > 0) {
        const supSet = new Set(supplierCategoryIds);
        filteredItems = allItems.filter(item => {
          const itemCats = Array.isArray(item.itemCategoryIds) ? item.itemCategoryIds : [];
          const itemTags = Array.isArray(item.categoryTags) ? item.categoryTags : [];
          const itemLegacy = Array.isArray(item.itemCategories) ? item.itemCategories : [];
          
          const allItemIdentifiers = Array.from(new Set([
            ...itemCats, 
            ...itemTags, 
            ...itemLegacy.map(c => typeof c === 'string' ? toSlug(c) : c).filter(Boolean)
          ]));

          if (allItemIdentifiers.length === 0) return true; // Show items with no category assigned (safety)
          return allItemIdentifiers.some(id => supSet.has(id) || supSet.has(toSlug(id)));
        });
      }

      if (filteredItems.length === 0) {
        console.log(`Skipping notification for ${email}: No categorization match found with items.`);
        return;
      }

      // 3. Generate personalized Excel bid form for this supplier
      let excelBuffer: Buffer | null = null;
      try {
        excelBuffer = await generateFullBidFormExcel(demandData, filteredItems);
      } catch (excelError) {
        console.error(`Excel generation failed for ${email}:`, excelError);
      }

      // Create unique token for this supplier
      const token = `${snap.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

      // Save bid invite token to Firestore
      await admin.firestore().collection('bidInvites').doc(token).set({
        demandId: snap.id,
        supplierEmail: email,
        recipientCategoryIds: supplierCategoryIds, // Traceability
        filteredItemIds: filteredItems.map((_, i) => i), // Simplified tracking
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
        used: false,
        createdBy: createdBy || null
      });

      const submitBidUrl = `${process.env.APP_URL || 'https://teklifbul-ce404.web.app'}/submit-bid.html?token=${token}`;

      // Build email payload
      const emailPayload: Record<string, unknown> = {
        from: fromAddress,
        to: email,
        subject: `Yeni Satın Alma Talebi: ${title}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>Satın Alma Talebi Daveti</h2>
            <p><strong>${demandData.creatorCompanyName || 'Bir firma'}</strong> sizinle uzmanlık alanınıza giren bir talep paylaştı.</p>
            <div style="background: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <p><strong>Başlık:</strong> ${title}</p>
              <p><strong>Kod:</strong> ${satfk || 'Oluşturuluyor...'}</p>
              <p><strong>Uzmanlık Alanınızla Eşleşen Kalem Sayısı:</strong> ${filteredItems.length}</p>
            </div>
            <p>Teklif vermek için aşağıdaki adımları takip edin:</p>
            <ol>
              <li>Ekteki size özel Excel dosyasını indirin ve fiyat bilgilerini doldurun.</li>
              <li>Aşağıdaki butona tıklayarak doldurulan Excel'i yükleyin.</li>
            </ol>
            <p style="margin: 20px 0;">
              <a href="${submitBidUrl}" 
                 style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Teklif Ver
              </a>
            </p>
            <p style="color: #666; font-size: 12px;">Bu link 7 gün geçerlidir. Sadece sizin kategorilerinizle eşleşen kalemleri içermektedir.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #22c55e;">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #166534;">📋 Ücretsiz Hesap Oluşturun</p>
              <p style="margin: 0 0 15px 0; color: #15803d; font-size: 14px;">
                Nefisoft'a üye olarak tüm talep ve tekliflerinizi tek bir yerden yönetebilirsiniz.
              </p>
              <a href="${process.env.APP_URL || 'https://teklifbul-ce404.web.app'}/register.html" 
                 style="display: inline-block; padding: 10px 20px; background: #22c55e; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                Kayıt Ol
              </a>
            </div>
          </div>
        `
      };

      if (excelBuffer) {
        emailPayload.attachments = [
          {
            filename: `Teklif_Formu_${satfk || snap.id}.xlsx`,
            content: excelBuffer.toString('base64')
          }
        ];
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify(emailPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send email to ${email}: ${response.status} ${errorText}`);
      } else {
        const data = await response.json() as { id: string };
        console.log(`Email sent to ${email} with token ${token}, id: ${data.id}. Items: ${filteredItems.length}`);
      }
    } catch (error) {
      console.error(`Error sending email to ${email}:`, error);
    }
  });

  await Promise.all(emailPromises);
});

/**
 * Share demand details via email (Callable) - v2
 * Triggered by demand owner from frontend
 */
/**
 * Share demand details via email (HTTPS Request - V2)
 * Triggered by demand owner from frontend via fetch
 * Uses built-in CORS support
 */
export const shareDemandViaEmail = onRequest({
  cors: GCF_CORS_ORIGINS,
}, async (req, res) => {
  // Only allow POST (or GET for health check / debugging)
  if (req.method === 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    // 2. Auth Check (Manual)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthenticated', message: 'Missing or invalid token' });
      return;
    }
    const idToken = authHeader.split('Bearer ')[1];

    // Verify token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      console.error('Token verification failed:', e);
      res.status(401).json({ error: 'Unauthenticated', message: 'Invalid token' });
      return;
    }

    const uid = decodedToken.uid;
    const { demandId, emails } = req.body;

    // 3. Input Validation
    if (!demandId || !emails || !Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: 'Invalid Argument', message: 'Missing demandId or emails' });
      return;
    }

    // 4. Ownership Verification
    const demandRef = admin.firestore().collection('demands').doc(demandId);
    const demandSnap = await demandRef.get();

    if (!demandSnap.exists) {
      res.status(404).json({ error: 'Not Found', message: 'Demand not found' });
      return;
    }

    const demandData = demandSnap.data();
    if (!demandData) {
      res.status(404).json({ error: 'Not Found', message: 'Demand empty' });
      return;
    }

    // Teklifbul Rule v1.0 — sahiplik / accepted şirket üyeliği zorunlu
    const isOwner = demandData.createdBy === uid;
    const isCompanyMember = isOwner
      ? true
      : await uidBelongsToCompany(uid, demandData.creatorCompanyId);
    if (!isOwner && !isCompanyMember) {
      res.status(403).json({ error: 'Forbidden', message: 'Bu talebi paylaşma yetkiniz yok' });
      return;
    }

    const escapeHtml = (value: unknown): string =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // 5. Fetch demand items for Excel generation
    const itemsSnap = await admin.firestore().collection('demands').doc(demandId).collection('items').get();
    const items = itemsSnap.docs.map(doc => doc.data());

    // 6. Generate Excel bid form
    let excelBuffer: Buffer | null = null;
    try {
      excelBuffer = await generateFullBidFormExcel(demandData, items);
      console.log(`Generated Excel for demand ${demandId}, size: ${excelBuffer.length} bytes`);
    } catch (excelError) {
      console.error('Excel generation failed:', excelError);
      // Continue without attachment if Excel fails
    }

    // Teklifbul Rule v1.0 - Production'da env zorunlu, hardcoded fallback kaldirildi
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY env eksik");
      res.status(503).json({ error: 'email_unavailable', message: 'E-posta gönderimi yapılandırılmamış' });
      return;
    }
    const fromAddress = getTransactionalFromAddress();
    if (!fromAddress) {
      res.status(503).json({ error: 'email_unavailable', message: 'E-posta gönderici adresi yapılandırılmamış' });
      return;
    }

    console.log(`Sharing demand ${demandId} with ${emails.length} recipients (User: ${uid})`);

    const emailPromises = emails.map(async (email: string) => {
      if (!email || !email.includes('@')) return;
      try {
        // Create unique token for this supplier
        const token = `${demandId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

        // Save bid invite token to Firestore
        await admin.firestore().collection('bidInvites').doc(token).set({
          demandId,
          supplierEmail: email,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt,
          used: false,
          createdBy: uid
        });

        const submitBidUrl = `${process.env.APP_URL || 'http://localhost:5174'}/submit-bid.html?token=${token}`;

        // Build email payload with optional attachment
        const emailPayload: Record<string, unknown> = {
          from: fromAddress,
          to: email,
          subject: `Sizinle Bir Satın Alma Talebi Paylaşıldı: ${demandData.title || 'İsimsiz'}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Satın Alma Talebi Daveti</h2>
              <p><strong>${escapeHtml(demandData.requester || demandData.creatorCompanyName || 'Bir firma')}</strong> sizinle bir talep paylaştı.</p>
              <div style="background: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 8px;">
                <p><strong>Başlık:</strong> ${escapeHtml(demandData.title)}</p>
                <p><strong>Kod:</strong> ${escapeHtml(demandData.satfk)}</p>
                <p><strong>Kalem Sayısı:</strong> ${items.length}</p>
              </div>
              <p>Teklif vermek için aşağıdaki adımları takip edin:</p>
              <ol>
                <li>Ekteki Excel dosyasını indirin ve fiyat bilgilerini doldurun.</li>
                <li>Aşağıdaki butona tıklayarak doldurulan Excel'i yükleyin.</li>
              </ol>
              <p style="margin: 20px 0;">
                <a href="${submitBidUrl}" 
                   style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                  Teklif Ver
                </a>
              </p>
              <p style="color: #666; font-size: 12px;">Bu link 7 gün geçerlidir.</p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #22c55e;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #166534;">📋 Ücretsiz Hesap Oluşturun</p>
                <p style="margin: 0 0 15px 0; color: #15803d; font-size: 14px;">
                  Nefisoft'a üye olarak tüm talep ve tekliflerinizi tek bir yerden yönetebilirsiniz.
                </p>
                <a href="${process.env.APP_URL || 'http://localhost:5174'}/register.html" 
                   style="display: inline-block; padding: 10px 20px; background: #22c55e; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">
                  Kayıt Ol
                </a>
              </div>
            </div>
          `
        };

        // Add Excel attachment if available
        if (excelBuffer) {
          emailPayload.attachments = [
            {
              filename: `Teklif_Formu_${demandData.satfk || demandId}.xlsx`,
              content: excelBuffer.toString('base64')
            }
          ];
        }

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify(emailPayload)
        });

        console.log(`Email sent to ${email} with token ${token}`);
      } catch (e) {
        console.error('Email send error', e);
      }
    });

    await Promise.all(emailPromises);

    res.json({ result: { success: true, count: emails.length } });

  } catch (error) {
    console.error('Share Handler Error:', error);
    res.status(500).json({ error: 'Internal', message: 'Server error' });
  }
});

/**
 * Teklifbul API Export
 * Connects the compiled Express app to Cloud Functions (lazy load — deploy analizi hızlı kalsın)
 */
let cachedApiApp: import('express').Express | null = null;

function getApiApp(): import('express').Express {
  if (cachedApiApp) return cachedApiApp;
  // @ts-ignore - Valid at runtime after build:api
  const mod = require('../dist/server/index.js');
  const app = mod.app ?? mod.default;
  if (!app) throw new Error('API app export missing in dist/server/index.js');
  cachedApiApp = app;
  return app;
}

// Teklifbul Rule v1.0 - invoker public zorunlu:
// Gen2/Cloud Run private iken Authorization: Bearer <Firebase ID token>
// Google IAM token sanılır → 401 invalid_token (Express'e hiç ulaşmaz).
// Uygulama kimliği Express verifyToken ile doğrulanır.
export const api = onRequest({
  memory: "512MiB",
  timeoutSeconds: 60,
  minInstances: 1,
  cors: GCF_CORS_ORIGINS,
  invoker: "public",
  secrets: [groqApiKey, paymentWebhookSecret],
}, (req, res) => getApiApp()(req, res));

/**
 * H-007A — Stuck paid AI hold recovery.
 * No prior scheduler existed; this is the first Cloud Scheduler function.
 * TTL (default 5m) avoids releasing in-flight /api/chat requests (API timeout 60s).
 */
export const recoverStuckAiTokenHolds = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'Europe/Istanbul',
  memory: '256MiB',
  timeoutSeconds: 120,
}, async () => {
  // @ts-ignore - Valid at runtime after build:api
  const mod = require('../dist/server/services/companyAiWalletHoldRecovery.js');
  await mod.recoverStuckCompanyAiHolds({
    pageSize: 50,
    maxPages: 10,
  });
});
