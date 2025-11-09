/**
 * Firestore Tax Offices Service
 * Teklifbul Rule v1.0 - Structured Logging
 * 
 * PostgreSQL alternatifi - $0 maliyet, otomatik yedekleme
 */

import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy
} from 'firebase/firestore';
import { cache } from './in-memory-cache';
import { logger } from '../shared/log/logger.js';

interface TaxOffice {
  id: string;
  province_name: string;
  district_name?: string;
  office_name: string;
  office_code?: string;
  office_type?: string;
  // Optimizasyon: lowercase alanlar (index için)
  province_name_lower?: string;
  district_name_lower?: string;
  office_name_lower?: string;
}

/**
 * Türkçe karakter normalizasyonu
 */
function normalizeTurkish(text: string): string {
  return text
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'I')
    .replace(/ş/g, 'S')
    .replace(/Ş/g, 'S')
    .replace(/ğ/g, 'G')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'U')
    .replace(/Ü/g, 'U')
    .replace(/ö/g, 'O')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'C')
    .replace(/Ç/g, 'C')
    .trim();
}

/**
 * İl listesi
 */
export async function getProvinces(): Promise<string[]> {
  const cacheKey = 'tax_offices:provinces';
  
  // Cache kontrolü
  const cached = await cache.get<string[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const officesRef = collection(db, 'tax_offices');
    const snapshot = await getDocs(officesRef);
    
    // Tüm illeri al ve unique yap
    const provinces = new Set<string>();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.province_name) {
        provinces.add(data.province_name);
      }
    });
    
    const provincesArray = Array.from(provinces).sort();
    
    // Cache'e kaydet (24 saat)
    await cache.set(cacheKey, provincesArray, 86400);
    
    return provincesArray;
  } catch (error: any) {
    logger.error('❌ Firestore getProvinces error:', error);
    throw new Error(`İller yüklenemedi: ${error.message}`);
  }
}

/**
 * Türkçe karakter normalizasyonu (lowercase - index için)
 */
function normalizeTurkishLower(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

/**
 * Vergi daireleri listesi (optimize edilmiş - index kullanıyor)
 * Teklifbul Rule v1.0 - Performans optimizasyonu
 * 
 * Önce index'li sorgu dener, yoksa fallback olarak client-side filter kullanır.
 */
export async function getTaxOffices(options: {
  province: string;
  district?: string;
}): Promise<TaxOffice[]> {
  const { province, district } = options;
  
  // Cache key
  const cacheKey = `tax_offices:${normalizeTurkish(province)}:${district ? normalizeTurkish(district) : 'all'}`;
  
  // Cache kontrolü
  const cached = await cache.get<TaxOffice[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const officesRef = collection(db, 'tax_offices');
    const normalizedProvinceLower = normalizeTurkishLower(province);
    
    // Optimizasyon: Index'li sorgu kullan (province_name_lower alanı varsa)
    // Fallback: Eski yöntem (tüm koleksiyonu çekip client-side filter)
    let snapshot;
    let useIndexedQuery = false;
    
    try {
      // Index'li sorgu dene
      const q = query(
        officesRef,
        where('province_name_lower', '==', normalizedProvinceLower),
        orderBy('office_name_lower', 'asc')
      );
      snapshot = await getDocs(q);
      useIndexedQuery = true;
      logger.info('✅ Index\'li sorgu kullanıldı', { province: normalizedProvinceLower });
    } catch (indexError: any) {
      // Index yoksa veya alan yoksa fallback
      if (indexError.code === 'failed-precondition' || indexError.message?.includes('index')) {
        logger.warn('⚠️  Index bulunamadı, fallback kullanılıyor', { error: indexError.message });
        // Fallback: Tüm koleksiyonu çek
        snapshot = await getDocs(officesRef);
        useIndexedQuery = false;
      } else {
        throw indexError;
      }
    }
    
    // Client-side filter (index'li sorgu kullanılmadıysa veya district filter varsa)
    let offices = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TaxOffice[];
    
    // Province filter (index'li sorgu kullanılmadıysa)
    if (!useIndexedQuery) {
      const normalizedProvince = normalizeTurkish(province);
      offices = offices.filter(office => {
        // Önce lowercase alanını kontrol et, yoksa eski yöntem
        if (office.province_name_lower) {
          return office.province_name_lower === normalizedProvinceLower;
        }
        return normalizeTurkish(office.province_name) === normalizedProvince;
      });
    }
    
    // District filter (eğer varsa)
    if (district) {
      const normalizedDistrictLower = normalizeTurkishLower(district);
      offices = offices.filter(office => {
        if (!office.district_name) return false;
        // Önce lowercase alanını kontrol et, yoksa eski yöntem
        if (office.district_name_lower) {
          return office.district_name_lower === normalizedDistrictLower;
        }
        return normalizeTurkish(office.district_name) === normalizeTurkish(district);
      });
    }
    
    // Sort by office_name (index'li sorgu kullanıldıysa zaten sıralı)
    if (!useIndexedQuery) {
      offices.sort((a, b) => a.office_name.localeCompare(b.office_name, 'tr'));
    }
    
    // Cache'e kaydet (24 saat)
    await cache.set(cacheKey, offices, 86400);
    
    return offices;
  } catch (error: any) {
    logger.error('❌ Firestore getTaxOffices error:', error);
    throw new Error(`Vergi daireleri yüklenemedi: ${error.message}`);
  }
}

