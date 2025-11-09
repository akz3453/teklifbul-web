/**
 * REFACTORED: Demands Migration Script
 * 
 * Migrates existing demands to the new refactored data model:
 * - Adds: status, creatorId, creatorCompanyId, supplierCategoryKeys, updatedAt
 * - Removes: visibility, isPublished, published (kept for backward compat temporarily)
 * 
 * Usage:
 *   node scripts/migrate-demands-refactor.js
 * 
 * Or run in Firebase Console → Firestore → Run migration
 */

const admin = require("firebase-admin");

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require("../serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Slug normalize function (matches frontend)
function toSlug(name) {
  if (!name) return '';
  return String(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[şŞ]/g, 's').replace(/[ıİ]/g, 'i').replace(/[ğĞ]/g, 'g')
    .replace(/[çÇ]/g, 'c').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function migrateDemands() {
  console.log("🚀 Starting demands migration...");
  
  try {
    // Get all demands
    const demandsSnapshot = await db.collection("demands").get();
    console.log(`📄 Found ${demandsSnapshot.size} demands to migrate`);
    
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500; // Firestore batch limit
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const docSnap of demandsSnapshot.docs) {
      try {
        const data = docSnap.data();
        const demandId = docSnap.id;
        
        // Skip if already migrated (has creatorId and creatorCompanyId)
        if (data.creatorId && data.creatorCompanyId && data.status) {
          console.log(`⏭️  Skipping ${demandId} - already migrated`);
          skipped++;
          continue;
        }
        
        const updateData = {};
        let needsUpdate = false;
        
        // 1. Status üret
        if (!data.status) {
          if (data.published === true || data.isPublished === true || 
              data.published === 'true' || data.isPublished === 'true') {
            updateData.status = 'published';
          } else if (data.geriCekildi === true || data.geriCekildi === 'true') {
            updateData.status = 'withdrawn';
          } else {
            updateData.status = 'draft';
          }
          needsUpdate = true;
          console.log(`📝 ${demandId}: status = ${updateData.status}`);
        }
        
        // 2. creatorId = createdBy
        if (!data.creatorId && data.createdBy) {
          updateData.creatorId = data.createdBy;
          needsUpdate = true;
        } else if (!data.creatorId && !data.createdBy) {
          console.warn(`⚠️  ${demandId}: No createdBy found, skipping creatorId`);
        }
        
        // 3. creatorCompanyId = companyId (veya user'dan çek)
        if (!data.creatorCompanyId) {
          if (data.companyId) {
            updateData.creatorCompanyId = data.companyId;
            needsUpdate = true;
          } else if (data.createdBy) {
            // Try to get from user document
            try {
              const userDoc = await db.collection("users").doc(data.createdBy).get();
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const userCompanyId = userData.companyId || 
                                     userData.currentCompanyId || 
                                     userData.activeCompanyId;
                if (userCompanyId) {
                  updateData.creatorCompanyId = userCompanyId;
                  needsUpdate = true;
                } else {
                  console.warn(`⚠️  ${demandId}: User ${data.createdBy} has no companyId`);
                }
              }
            } catch (e) {
              console.warn(`⚠️  ${demandId}: Could not load user ${data.createdBy}:`, e.message);
            }
          }
        }
        
        // 4. supplierCategoryKeys = categoryTags'dan normalize et
        if (!data.supplierCategoryKeys || data.supplierCategoryKeys.length === 0) {
          const categoryTags = data.categoryTags || [];
          if (Array.isArray(categoryTags) && categoryTags.length > 0) {
            // CategoryTags zaten slug formatında olabilir, yine de normalize et
            updateData.supplierCategoryKeys = categoryTags.map(cat => {
              if (typeof cat === 'string') {
                // Eğer zaten slug formatındaysa olduğu gibi kullan
                if (cat.match(/^[a-z0-9-]+$/)) {
                  return cat;
                }
                // Değilse normalize et
                return toSlug(cat);
              }
              return toSlug(String(cat));
            }).filter(Boolean);
            needsUpdate = true;
          } else {
            // Kategori yok, boş array
            updateData.supplierCategoryKeys = [];
            needsUpdate = true;
          }
        }
        
        // 5. updatedAt ekle (yoksa)
        if (!data.updatedAt) {
          updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          const demandRef = db.collection("demands").doc(demandId);
          batch.update(demandRef, updateData);
          batchCount++;
          migrated++;
          
          // Batch limit reached, commit and start new batch
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`✅ Committed batch of ${batchCount} updates`);
            batchCount = 0;
          }
        } else {
          skipped++;
        }
        
      } catch (error) {
        console.error(`❌ Error migrating demand ${docSnap.id}:`, error);
        errors++;
      }
    }
    
    // Commit remaining batch
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✅ Committed final batch of ${batchCount} updates`);
    }
    
    console.log("\n✅ Migration complete!");
    console.log(`📊 Summary:`);
    console.log(`   - Migrated: ${migrated}`);
    console.log(`   - Skipped: ${skipped}`);
    console.log(`   - Errors: ${errors}`);
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run migration
if (require.main === module) {
  migrateDemands()
    .then(() => {
      console.log("✅ Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = { migrateDemands };

