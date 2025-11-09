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
 * Vergi daireleri listesi
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
    
    // Tüm vergi dairelerini al (Firestore'da case-insensitive search yok, client-side filter)
    const snapshot = await getDocs(officesRef);
    
    // Client-side filter
    let offices = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TaxOffice[];
    
    // Province filter (case-insensitive, Turkish character aware)
    const normalizedProvince = normalizeTurkish(province);
    offices = offices.filter(office => 
      normalizeTurkish(office.province_name) === normalizedProvince
    );
    
    // District filter (eğer varsa)
    if (district) {
      const normalizedDistrict = normalizeTurkish(district);
      offices = offices.filter(office => 
        office.district_name && normalizeTurkish(office.district_name) === normalizedDistrict
      );
    }
    
    // Sort by office_name
    offices.sort((a, b) => a.office_name.localeCompare(b.office_name, 'tr'));
    
    // Cache'e kaydet (24 saat)
    await cache.set(cacheKey, offices, 86400);
    
    return offices;
  } catch (error: any) {
    logger.error('❌ Firestore getTaxOffices error:', error);
    throw new Error(`Vergi daireleri yüklenemedi: ${error.message}`);
  }
}

