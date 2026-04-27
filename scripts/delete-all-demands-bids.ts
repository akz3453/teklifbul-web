/**
 * Delete All Demands and Bids Script
 * Teklifbul Rule v1.0 - Structured Logging
 * 
 * ⚠️ UYARI: Bu script TÜM talepleri ve teklifleri kalıcı olarak siler!
 */

import { getAdminDb } from '../server/utils/firestore.js';
import { logger } from '../src/shared/log/logger.js';

async function deleteAllDemandsAndBids() {
  logger.group('🗑️ Tüm Talepler ve Teklifler Siliniyor');
  
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.error('Firestore Admin DB bağlantısı kurulamadı');
      logger.end();
      return;
    }

    // 1. Tüm teklifleri sil
    logger.info('Teklifler siliniyor...');
    const bidsSnapshot = await db.collection('bids').get();
    const bidsCount = bidsSnapshot.size;
    logger.info(`${bidsCount} teklif bulundu`);
    
    let deletedBids = 0;
    const batchSize = 500; // Firestore batch limit
    
    for (let i = 0; i < bidsSnapshot.docs.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = bidsSnapshot.docs.slice(i, i + batchSize);
      
      batchDocs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      deletedBids += batchDocs.length;
      logger.info(`${deletedBids}/${bidsCount} teklif silindi`);
    }
    
    logger.info(`✅ ${deletedBids} teklif silindi`);

    // 2. Tüm talepleri ve alt koleksiyonlarını sil
    logger.info('Talepler siliniyor...');
    const demandsSnapshot = await db.collection('demands').get();
    const demandsCount = demandsSnapshot.size;
    logger.info(`${demandsCount} talep bulundu`);
    
    let deletedDemands = 0;
    
    for (const demandDoc of demandsSnapshot.docs) {
      const demandId = demandDoc.id;
      
      try {
        // Items subcollection'ı sil
        const itemsSnapshot = await db.collection('demands').doc(demandId).collection('items').get();
        if (itemsSnapshot.size > 0) {
          const itemsBatch = db.batch();
          itemsSnapshot.docs.forEach(itemDoc => {
            itemsBatch.delete(itemDoc.ref);
          });
          await itemsBatch.commit();
          logger.info(`  ${itemsSnapshot.size} item silindi (talep: ${demandId})`);
        }
        
        // Files subcollection'ı sil
        const filesSnapshot = await db.collection('demands').doc(demandId).collection('files').get();
        if (filesSnapshot.size > 0) {
          const filesBatch = db.batch();
          filesSnapshot.docs.forEach(fileDoc => {
            filesBatch.delete(fileDoc.ref);
          });
          await filesBatch.commit();
          logger.info(`  ${filesSnapshot.size} dosya silindi (talep: ${demandId})`);
        }
        
        // DemandRecipients sil (eğer varsa)
        const recipientsSnapshot = await db.collection('demandRecipients')
          .where('demandId', '==', demandId)
          .get();
        if (recipientsSnapshot.size > 0) {
          const recipientsBatch = db.batch();
          recipientsSnapshot.docs.forEach(recipientDoc => {
            recipientsBatch.delete(recipientDoc.ref);
          });
          await recipientsBatch.commit();
          logger.info(`  ${recipientsSnapshot.size} alıcı kaydı silindi (talep: ${demandId})`);
        }
        
        // Talep sil
        await demandDoc.ref.delete();
        deletedDemands++;
        
        if (deletedDemands % 10 === 0) {
          logger.info(`${deletedDemands}/${demandsCount} talep silindi`);
        }
      } catch (error: any) {
        logger.warn(`Talep silinirken hata (${demandId}):`, error.message);
      }
    }
    
    logger.info(`✅ ${deletedDemands} talep silindi`);
    
    // Özet
    logger.info('📊 Silme Özeti:', {
      toplamTeklif: deletedBids,
      toplamTalep: deletedDemands
    });
    
    logger.info('✅ Tüm talepler ve teklifler başarıyla silindi');
    logger.end();
    
  } catch (error: any) {
    logger.error('❌ Silme işlemi başarısız', error);
    logger.end();
    process.exit(1);
  }
}

// Script çalıştır
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('delete-all-demands-bids')) {
  // Onay kontrolü
  const args = process.argv.slice(2);
  if (!args.includes('--confirm')) {
    console.error('⚠️  UYARI: Bu script TÜM talepleri ve teklifleri kalıcı olarak siler!');
    console.error('Onaylamak için: npm run delete:all -- --confirm');
    process.exit(1);
  }
  
  deleteAllDemandsAndBids()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('Fatal error', error);
      process.exit(1);
    });
}

export { deleteAllDemandsAndBids };

