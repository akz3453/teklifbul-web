/**
 * Migration Script: Stoklara CompanyId Ekleme
 * Teklifbul Rule v1.0 - Mevcut stokların companyId alanını günceller
 * 
 * Kullanım:
 * 1. Tarayıcı konsolunda çalıştırın
 * 2. Veya sayfaya import edip çalıştırın
 */

import { db, requireAuth } from '/firebase.js';
import { collection, getDocs, updateDoc, doc, query, where } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { logger } from '/src/shared/log/logger.js';
import { toast } from '/src/shared/ui/toast.js';

/**
 * Tüm stokları companyId ile güncelle
 * @param {string} companyId - Güncellenecek companyId
 * @param {boolean} dryRun - Sadece test et, gerçekten güncelleme yapma
 */
export async function migrateStocksCompanyId(companyId, dryRun = true) {
  try {
    logger.group('Stok CompanyId Migration');
    
    if (!companyId) {
      const user = await requireAuth();
      const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      companyId = userData.companyId;
      
      if (!companyId) {
        logger.error('CompanyId bulunamadı');
        toast.error('CompanyId bulunamadı. Lütfen kullanıcı bilgilerinizi kontrol edin.');
        logger.end();
        return;
      }
    }
    
    logger.info('Migration başlatılıyor', { companyId, dryRun });
    
    // CompanyId'si olmayan veya null olan tüm stokları bul
    const allStocksQuery = query(collection(db, 'stocks'));
    const allStocksSnap = await getDocs(allStocksQuery);
    
    const stocksToUpdate = [];
    allStocksSnap.forEach(doc => {
      const data = doc.data();
      const hasCompanyId = data.companyId && String(data.companyId).trim() !== '';
      
      if (!hasCompanyId) {
        stocksToUpdate.push({
          id: doc.id,
          sku: data.sku || 'N/A',
          name: data.name || 'N/A',
          currentCompanyId: data.companyId || null
        });
      }
    });
    
    logger.info(`${stocksToUpdate.length} stok güncellenecek`, stocksToUpdate.slice(0, 5));
    
    if (stocksToUpdate.length === 0) {
      logger.info('Güncellenecek stok bulunamadı');
      toast.info('Tüm stoklar zaten companyId\'ye sahip.');
      logger.end();
      return;
    }
    
    if (dryRun) {
      logger.warn('DRY RUN MODU - Gerçek güncelleme yapılmayacak');
      logger.info('Güncellenecek stoklar:', stocksToUpdate);
      toast.info(`DRY RUN: ${stocksToUpdate.length} stok güncellenecek. Gerçek güncelleme için dryRun=false yapın.`);
      logger.end();
      return;
    }
    
    // Onay iste
    const confirmed = confirm(
      `⚠️ DİKKAT: ${stocksToUpdate.length} stok güncellenecek.\n\n` +
      `CompanyId: ${companyId}\n\n` +
      `Bu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?`
    );
    
    if (!confirmed) {
      logger.info('Migration iptal edildi');
      toast.info('Migration iptal edildi');
      logger.end();
      return;
    }
    
    // Stokları güncelle
    let successCount = 0;
    let errorCount = 0;
    
    for (const stock of stocksToUpdate) {
      try {
        await updateDoc(doc(db, 'stocks', stock.id), {
          companyId: companyId,
          updatedAt: new Date()
        });
        successCount++;
        logger.info(`✅ Güncellendi: ${stock.sku}`, { id: stock.id });
      } catch (error) {
        errorCount++;
        logger.error(`❌ Hata: ${stock.sku}`, { id: stock.id, error: error.message });
      }
    }
    
    logger.info('Migration tamamlandı', {
      total: stocksToUpdate.length,
      success: successCount,
      error: errorCount
    });
    
    toast.success(`Migration tamamlandı! ${successCount} stok güncellendi, ${errorCount} hata.`);
    logger.end();
    
    return {
      total: stocksToUpdate.length,
      success: successCount,
      error: errorCount
    };
    
  } catch (error) {
    logger.error('Migration hatası', error);
    toast.error(`Migration hatası: ${error.message}`);
    logger.end();
    throw error;
  }
}

/**
 * Belirli bir companyId'ye ait stokları güncelle
 * @param {string} targetCompanyId - Güncellenecek companyId
 * @param {boolean} dryRun - Sadece test et
 */
export async function migrateStocksByCompanyId(targetCompanyId, dryRun = true) {
  return await migrateStocksCompanyId(targetCompanyId, dryRun);
}

// Global scope'a ekle (tarayıcı konsolundan kullanım için)
if (typeof window !== 'undefined') {
  window.migrateStocksCompanyId = migrateStocksCompanyId;
  window.migrateStocksByCompanyId = migrateStocksByCompanyId;
}

