/**
 * Supplier Matching Service
 * Kategori etiketine göre tedarikçi eşleştirme servisi
 */

import { categoriesForItems } from './category';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';

/**
 * Supplier bilgileri
 */
export interface SupplierInfo {
  /** Supplier ID (user UID) */
  id: string;
  /** Supplier adı/ünvanı */
  title: string;
  /** Diğer supplier bilgileri */
  [key: string]: any;
}

/**
 * Kategori bazlı supplier eşleştirme sonucu
 */
export interface CategorySupplierMatch {
  /** Kategori adı */
  category: string;
  /** Bu kategoriye ait supplier'lar */
  suppliers: SupplierInfo[];
}

/**
 * Kategori etiketine göre tedarikçi listesi çek
 * Firestore'dan aktif supplier'ları kategori bazlı sorgular
 * 
 * @param items - Talep kalemleri (kategori çıkarımı için)
 * @returns Kategori bazlı supplier eşleştirme sonuçları
 * 
 * @example
 * ```typescript
 * const items = [
 *   { name: 'Çimento', category: 'İnşaat Malzemeleri' },
 *   { name: 'Kablo', category: 'Elektrik' }
 * ];
 * const matches = await matchSuppliers(items);
 * // [
 * //   { category: 'İnşaat Malzemeleri', suppliers: [...] },
 * //   { category: 'Elektrik', suppliers: [...] }
 * // ]
 * ```
 */
export async function matchSuppliers(items: any[]): Promise<CategorySupplierMatch[]> {
  const cats = categoriesForItems(items);
  const db = await getAdminDb();
  
  if (!db) {
    logger.warn('Firestore unavailable, returning mock suppliers');
    // Fallback: Mock data
    return cats.map((c, i) => ({
      category: c,
      suppliers: [
        { id: `sup-${i+1}-A`, title: `${c} A.Ş.` },
        { id: `sup-${i+1}-B`, title: `${c} Tic.` },
        { id: `sup-${i+1}-C`, title: `${c} Ltd.` }
      ]
    }));
  }
  
  // Firestore'dan kategoriye göre tedarikçi sorgula
  const results = await Promise.all(
    cats.map(async (category) => {
      try {
        // Kategori slug'ını normalize et (küçük harf, tire ile)
        const categorySlug = category.toLowerCase().replace(/\s+/g, '-');
        
        // Firestore sorgusu: users koleksiyonunda supplier'ları bul
        // Üç farklı kategori alanını kontrol et (geriye dönük uyumluluk)
        const queries = [
          // Yeni sistem: supplierCategoryIds
          db.collection('users')
            .where('isActive', '==', true)
            .where('roles', 'array-contains', 'supplier')
            .where('supplierCategoryIds', 'array-contains-any', [categorySlug])
            .limit(50),
          // Orta sistem: supplierCategoryKeys
          db.collection('users')
            .where('isActive', '==', true)
            .where('roles', 'array-contains', 'supplier')
            .where('supplierCategoryKeys', 'array-contains-any', [categorySlug])
            .limit(50),
          // Eski sistem: supplierCategories
          db.collection('users')
            .where('isActive', '==', true)
            .where('roles', 'array-contains', 'supplier')
            .where('supplierCategories', 'array-contains-any', [category])
            .limit(50),
        ];
        
        const allSuppliers = new Map<string, any>();
        
        // Tüm sorguları çalıştır ve birleştir
        for (const query of queries) {
          try {
            const snapshot = await query.get();
            snapshot.docs.forEach(doc => {
              const data = doc.data();
              if (!allSuppliers.has(doc.id)) {
                allSuppliers.set(doc.id, {
                  id: doc.id,
                  title: data.displayName || data.name || data.companyName || doc.id,
                  ...data
                });
              }
            });
          } catch (error: any) {
            // Index hatası olabilir, sessizce devam et
            if (error.code !== 'failed-precondition') {
              logger.warn('Supplier query failed', { category, error: error.message });
            }
          }
        }
        
        return {
          category,
          suppliers: Array.from(allSuppliers.values())
        };
      } catch (error: any) {
        logger.error('Supplier matching error', { category, error });
        // Fallback: Boş liste
        return {
          category,
          suppliers: []
        };
      }
    })
  );
  
  return results;
}

/**
 * Supplier bilgilerini normalize et
 * 
 * @param doc - Firestore document snapshot
 * @returns Normalize edilmiş supplier bilgisi
 */
function normalizeSupplier(doc: FirebaseFirestore.DocumentSnapshot): SupplierInfo {
  const data = doc.data();
  return {
    id: doc.id,
    title: data?.displayName || data?.name || data?.companyName || doc.id,
    ...data
  };
}


