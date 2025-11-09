/**
 * Para Birimi ve Kur Servisi
 * 
 * TRY dışı para birimi için kur bilgilerini yönetir.
 */

import { Currency, CurrencyInfo } from '../domain/offer/schema';

/**
 * Kur kaynakları
 */
export type CurrencySource = 'TCMB' | 'XE' | 'MANUAL' | 'OTHER';

/**
 * Varsayılan kur bilgileri (güncel olmayabilir, sadece referans)
 */
const DEFAULT_RATES: Record<Currency, number> = {
  TRY: 1.0,
  USD: 32.5,
  EUR: 35.0,
  GBP: 41.0,
};

/**
 * Kur bilgisi al (şimdilik manuel giriş, ileride API entegrasyonu için hazır)
 */
export async function getCurrencyRate(
  currency: Currency,
  date?: Date
): Promise<number> {
  // Şimdilik varsayılan kur, ileride TCMB/XE API'den çekilebilir
  if (currency === 'TRY') return 1.0;
  
  // Tarih belirtilmişse (gelecek için hazır)
  if (date) {
    // API çağrısı buraya eklenebilir
    // const rate = await fetchTCMBRate(currency, date);
    // return rate || DEFAULT_RATES[currency];
  }
  
  return DEFAULT_RATES[currency] || 1.0;
}

/**
 * Para birimi için kur bilgisi oluştur
 */
export async function createCurrencyInfo(
  currency: Currency,
  rate?: number,
  date?: Date,
  source: CurrencySource = 'MANUAL'
): Promise<CurrencyInfo | undefined> {
  if (currency === 'TRY') {
    // TRY için kur bilgisi gerekmez
    return undefined;
  }
  
  const fxRate = rate || await getCurrencyRate(currency, date);
  const fxDate = date ? date.toISOString() : new Date().toISOString();
  
  return {
    fxCurrency: currency,
    fxRate,
    fxDate,
    source,
  };
}

/**
 * Kur bilgisi gerekip gerekmediğini kontrol et
 */
export function requiresCurrencyInfo(currency: Currency): boolean {
  return currency !== 'TRY';
}

/**
 * Para birimi adını Türkçe'ye çevir
 */
export function getCurrencyNameTR(currency: Currency): string {
  const names: Record<Currency, string> = {
    TRY: 'Türk Lirası',
    USD: 'Amerikan Doları',
    EUR: 'Euro',
    GBP: 'İngiliz Sterlini',
  };
  
  return names[currency];
}

/**
 * Kur formatla (görüntüleme için)
 */
export function formatRate(rate: number, currency: Currency): string {
  if (currency === 'TRY') return '1.00';
  return rate.toFixed(4);
}

