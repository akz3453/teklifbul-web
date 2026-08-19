/**
 * Invite Service
 * Kategori gruplarından supplier eşleştirme servisi
 */
import { getAdminDb } from "../../utils/firestore.js";
import { logger } from "../../../src/shared/log/logger.js";
/**
 * Category group ID'lerinden supplier ID'leri hesapla
 *
 * @param groupIds - Kategori grup ID'leri (users/{uid}/categoryGroups/{groupId})
 * @param uid - Kullanıcı ID'si (grup sahibi)
 * @returns Supplier ID listesi
 */
export async function resolveGroupMembers(groupIds, uid) {
    if (!groupIds.length || !uid)
        return [];
    const db = await getAdminDb();
    if (!db) {
        logger.warn('Firestore unavailable, returning empty supplier list');
        return [];
    }
    try {
        logger.group('Grup Üyeleri Çözümleme');
        const allSupplierIds = new Set();
        const allCategories = new Set();
        // Her grup için category groups dokümanını al
        for (const groupId of groupIds) {
            try {
                const groupDoc = await db.collection('users').doc(uid).collection('categoryGroups').doc(groupId).get();
                if (!groupDoc.exists) {
                    logger.warn('Category group bulunamadı', { uid, groupId });
                    continue;
                }
                const groupData = groupDoc.data();
                const categories = groupData?.categories || [];
                logger.info('Category group bulundu', { groupId, categoryCount: categories.length });
                // Kategorileri topla (isim formatında)
                categories.forEach((cat) => {
                    if (cat && typeof cat === 'string') {
                        allCategories.add(cat.trim());
                    }
                });
            }
            catch (error) {
                logger.warn('Category group okuma hatası', { groupId, error: error.message });
            }
        }
        if (allCategories.size === 0) {
            logger.warn('Hiç kategori bulunamadı', { groupIds });
            logger.end();
            return [];
        }
        logger.info('Toplam kategori sayısı', { count: allCategories.size });
        // Kategorilere göre supplier'ları bul
        // Üç farklı kategori alanını kontrol et (geriye dönük uyumluluk)
        const categoryArray = Array.from(allCategories);
        // Kategori isimlerini normalize et (slug formatına çevir)
        const categorySlugs = categoryArray.map(cat => cat.toLowerCase().replace(/\s+/g, '-'));
        // Batch'ler halinde sorgula (Firestore limit: 10 kategori)
        for (let i = 0; i < categoryArray.length; i += 10) {
            const batch = categoryArray.slice(i, i + 10);
            const batchSlugs = categorySlugs.slice(i, i + 10);
            const queries = [
                // Yeni sistem: supplierCategoryIds
                db.collection('users')
                    .where('isActive', '==', true)
                    .where('roles', 'array-contains', 'supplier')
                    .where('supplierCategoryIds', 'array-contains-any', batchSlugs)
                    .limit(50),
                // Orta sistem: supplierCategoryKeys
                db.collection('users')
                    .where('isActive', '==', true)
                    .where('roles', 'array-contains', 'supplier')
                    .where('supplierCategoryKeys', 'array-contains-any', batchSlugs)
                    .limit(50),
                // Eski sistem: supplierCategories (isim formatı)
                db.collection('users')
                    .where('isActive', '==', true)
                    .where('roles', 'array-contains', 'supplier')
                    .where('supplierCategories', 'array-contains-any', batch)
                    .limit(50),
            ];
            // Tüm sorguları çalıştır ve birleştir
            for (const query of queries) {
                try {
                    const snapshot = await query.get();
                    snapshot.docs.forEach(doc => {
                        allSupplierIds.add(doc.id);
                    });
                }
                catch (error) {
                    // Index hatası olabilir, sessizce devam et
                    if (error.code !== 'failed-precondition') {
                        logger.warn('Supplier sorgusu başarısız', { batch, error: error.message });
                    }
                }
            }
        }
        logger.info('Toplam supplier sayısı', { count: allSupplierIds.size });
        logger.end();
        return Array.from(allSupplierIds);
    }
    catch (error) {
        logger.error('Grup üyeleri çözümleme hatası', error);
        return [];
    }
}
/**
 * Talep için davet edilecek supplier ID'lerini hesapla
 *
 * @param input - Talep input verisi
 * @returns Supplier ID listesi
 */
export async function computeInvitedSupplierIds(input) {
    if (input.demandVisibility !== "ozel")
        return [];
    if (input.inviteMode === "auto") {
        // Otomatik mod: Category groups'dan supplier'ları bul
        const members = await resolveGroupMembers(input.selectedGroupIds, input.ownerId);
        return Array.from(new Set(members)); // uniq
    }
    else {
        // Özel mod: Kullanıcının seçtiği supplier'ları kullan
        return Array.from(new Set(input.invitedSupplierIds));
    }
}
