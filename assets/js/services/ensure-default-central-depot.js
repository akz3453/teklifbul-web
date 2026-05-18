/**
 * Yeni şirket için varsayılan "Merkez Depo" stok lokasyonu (idempotent).
 * Teklifbul Rule v1.0
 *
 * Firestore `stock_locations` oluşturma kuralı: kullanıcı `companyId` ile eşleşmeli.
 * Bu nedenle çağrı, kullanıcı dokümanında ilgili `companyId` yazıldıktan sonra yapılmalıdır.
 */
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { logger } from '/src/shared/log/logger.js';

export const DEFAULT_CENTRAL_DEPOT_NAME = 'Merkez Depo';

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {{ companyId: string; createdByUid?: string | null }} params
 */
export async function ensureDefaultCentralDepotLocation(db, { companyId, createdByUid }) {
  if (!db || !companyId) return;

  logger.group('ensureDefaultCentralDepotLocation');
  try {
    const dupQuery = query(
      collection(db, 'stock_locations'),
      where('companyId', '==', companyId),
      where('name', '==', DEFAULT_CENTRAL_DEPOT_NAME),
      limit(1)
    );
    const existing = await getDocs(dupQuery);
    if (!existing.empty) {
      logger.info('Merkez Depo lokasyonu zaten var', { companyId });
      return;
    }

    await addDoc(collection(db, 'stock_locations'), {
      companyId,
      name: DEFAULT_CENTRAL_DEPOT_NAME,
      type: 'DEPOT',
      addressSummary:
        'Otomatik oluşturuldu; ayrıntılı adresi Ayarlar üzerinden güncelleyebilirsiniz.',
      createdAt: serverTimestamp(),
      ...(createdByUid ? { createdBy: createdByUid } : {}),
    });
    logger.info('Varsayılan Merkez Depo lokasyonu oluşturuldu', { companyId });
  } catch (err) {
    logger.error('Varsayılan Merkez Depo oluşturulamadı', err);
  } finally {
    logger.end();
  }
}
