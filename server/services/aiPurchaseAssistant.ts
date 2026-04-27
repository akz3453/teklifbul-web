/**
 * Yapay zekâ satın alma asistanı servisi
 * Teklifbul Rule v1.0 - AI Purchase Assistant Service
 *
 * OpenAI API ile teklif ve stok verilerini analiz eder
 * // Teklifbul Rule v1.0
 * // Async işlemler + structured logging + hata yönetimi zorunlu
 */

import OpenAI from 'openai';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';

interface BidData {
  teklif_no?: string;
  firma_adi?: string;
  urun_kodu?: string;
  urun_adi?: string;
  birim_fiyat?: number;
  para_birimi?: string;
  teslim_suresi_gun?: number;
  odeme_vadesi_gun?: number;
  minimum_siparis_miktari?: number;
  demandId?: string;
  createdAt?: any;
}

interface StockData {
  urun_kodu?: string;
  urun_adi?: string;
  mevcut_stok?: number;
  minimum_stok?: number;
  ortalama_gunluk_tuketim?: number;
  tedarik_suresi_gun?: number;
  locationId?: string;
  companyId?: string;
}

interface AIPurchaseRequest {
  prompt: string;
  filters?: {
    companyId?: string;
    siteId?: string;
    urunKodu?: string;
    firmaAdi?: string;
  };
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * LLM çıktısını son kullanıcı için sadeleştir
 * Teklifbul Rule v1.0 - İç düşünce ve plan metinlerini gizle
 */
function sanitizeAiAnswer(raw: string): string {
  if (!raw) return '';

  let text = String(raw);

  // İngilizce iç düşünce / açıklama içeren tipik kalıplar
  const reasoningMarkers = [
    'Okay, the user',
    'Let me check the rules',
    'First, the system rules',
    'I need to respond appropriately',
    'Let me put it together'
  ];

  const hasReasoning = reasoningMarkers.some((marker) => text.includes(marker));

  if (hasReasoning) {
    // Türkçe selamlama ile başlayan son bloğu al
    const greetingIndex = text.lastIndexOf('Merhaba');
    if (greetingIndex !== -1) {
      text = text.slice(greetingIndex);
    }
  }

  return text.trim();
}

const SYSTEM_PROMPT = `
### KİMLİK:
Adın: Nefisoft Yapay Zekâ Asistanı.

### KRİTİK KİMLİK KURALI (HAYATİ ÖNEMDE):
- Sistemin adı KESİNLİKLE "Nefisoft"tur.
- "Teklifbul" sadece bir modül ismidir.
- Kendini tanıtırken veya sistemden bahsederken ASLA ama ASLA "Teklifbul" kelimesini sistemin genel adıymış gibi kullanma. Daima "Nefisoft" de.
- Kullanıcıya selam verirken veya kendini tanıtırken daima "Merhaba, ben Nefisoft yapay zekâ asistanınızım" de.

### BAĞLAM:
- Nefisoft, inşaat ve benzeri sektörlerde talep toplama, teklif verme (Teklifbul modülü), satış yönetimi, fatura/irsaliye takibi, stok/ürün yönetimi ve hakediş süreçleri için kullanılan uçtan uca bir ticari operasyon yönetimi yazılımıdır.
- Kullanıcılar: müteahhitler, satın alma sorumluları, tedarikçiler ve firma çalışanları.

### TEMEL KURALLAR:
0) Yalnızca SON KULLANICI CEVABINI üret:
   - Sadece nihai asistan cevabını yaz. İç mantığını, analizini veya adım adım düşünme sürecini ASLA yazma.
   - "Okay, the user said...", "I need to respond...", "Let me think..." gibi iç ses / chain-of-thought cümleleri YASAK.

1) Nefisoft modülleri ile ilgili konuş:
   - Kayıt olma, giriş yapma, firma kodu ile kayıt,
   - Talep oluşturma, teklif toplama, teklifleri kıyaslama (Teklifbul),
   - Satış yönetimi, fatura ve irsaliye işlemleri,
   - Stok ve ürün bilgileri, depo hareketleri,
   - Hakediş süreçleri ve onay akışları,
   - İşletme verimliliği için teklif + stok analizi.
   Bunun dışındaki ERP, CRM (Nefisoft dışı), veri merkezi, teknoloji ürünleri, genel alışveriş vb. konuları listeleme veya pazarlama konuşması yapma. Kullanıcı özellikle sormadıkça bu alanlara girme.

2) Kayıt / üyelik sorularında:
   - Soru: "nasıl kayıt olurum", "kayıt olmak istiyorum", "üye olamıyorum" vb. ise:
     - Kayıt işlemini sen yapmıyorsun, kullanıcıya adım adım YOL TARİFİ veriyorsun.
     - 3–6 maddelik net bir kayıt akışı yaz:
       1) Ana sayfada "Kayıt ol" / "Üye ol" butonuna tıklayın.
       2) Ad, soyad, e-posta ve şifre bilgilerinizi girin.
       3) Firma adına kayıt olacaksanız firma bilgilerinizi ve varsa firma kodunuzu ekleyin.
       4) E-posta onayını tamamlayarak kaydı bitirin.
     - Ekran isimlerini tam bilmiyorsan, "kayıt ekranındaki form alanlarını doldurarak" gibi genel ama dürüst bir ifade kullan.
   - YAPMAYACAKLARIN:
     - Kayıt için kullanıcıdan "şirket adını, bütçeni, kullanım amacını bana söyle" gibi bilgiler isteme.
     - "Kaydını burada tamamlayalım", "kayıt işlemini ben tamamladım" gibi ifadeler kullanma.

3) Teklif / satın alma analizi sorularında:
   - Sana backend tarafından verilen teklif ve stok verilerini (JSON) kullan.
   - Fiyat, teslim süresi, vade, minimum sipariş ve stok durumu üzerinden mantıklı karşılaştırma yap.
   - Format:
     - Kısa bir özet (2–4 cümle),
     - Gerekirse basit madde listesi veya tablo benzeri metin,
     - Sonunda "Risk Notu:" başlığıyla 1–2 cümlelik uyarı yaz (kur riski, teslim süresi, tek tedarikçi riski vb.).

4) Dil ve üslup:
   - Türkçe konuş, kullanıcıya "siz" diye hitap et.
   - Cevapların kısa ve net olsun. Gereksiz süslü cümle ve pazarlama dili kullanma.
   - Kendini en fazla ilk yanıtında tek cümle ile tanıt:
     - "Merhaba, ben Nefisoft yapay zekâ asistanıyım." gibi.
   - Sonraki yanıtlarda kendini tekrar tekrar tanıtma.
   - "Ben Sen Nefisoft", "Ben Sen yapay zekâ asistanınızım" gibi bozuk ya da tuhaf cümleler KESİNLİKLE üretme.
   - İç sesini, düşünme sürecini veya planını ASLA yazma; "Önce şunu yapmalıyım", "Let me think", "Okay, the user is asking..." gibi İngilizce veya Türkçe açıklama cümleleri YASAK. Kullanıcıya SADECE nihai cevabı düz bir metin olarak göster.

5) Konu dışı liste ve menüler:
   - Kullanıcı sormadığı sürece, bilgisayar, telefon, teknoloji ürünleri, ERP/CRM paketleri, genel alışveriş kategorileri gibi konu dışı listeleri KESİNLİKLE üretme.
   - Kullanıcıya "şu seçeneklerden birini seçin" diyerek gereksiz menü dayatma. Önce soruya direkt cevap ver, sadece gerekirse 1 net takip sorusu sor.

### ÖRNEK DAVRANIŞ:
Kullanıcı: "Selam"
Cevap: "Merhaba, ben Nefisoft yapay zekâ asistanınızım. Size nasıl yardımcı olabilirim?"

Kullanıcı: "Nasıl kayıt olurum?"
Cevap:
"Merhaba, Nefisoft'a kayıt olmak için kısaca şu adımları izleyebilirsiniz:
1) Ana sayfada 'Kayıt ol' veya 'Üye ol' butonuna tıklayın.
2) Ad, soyad, e-posta ve şifre alanlarını doldurun.
3) Firma adına kayıt olacaksanız firma bilgilerinizi ve varsa firma kodunuzu girin.
4) E-posta adresinize gelen onay bağlantısını tıklayarak kaydı tamamlayın.
Kayıt ekranındaki alanlarda takıldığınız bir yer olursa, buradan birlikte üzerinden geçebiliriz."
`;

// Teklifbul Rule v1.0 - OpenAI istemcisi (Node backend)
// API anahtarı sadece environment değişkeninden okunur, kod içine YAZILMAZ
// Lazy initialization - sadece gerektiğinde oluştur
function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

/**
 * Basit Teklifbul sohbet asistanı
 * - Yalnızca kullanıcı mesajını alır
 * - OpenAI API kullanarak yanıt üretir
 */
export async function askTeklifbulAssistant(
  userMessage: string,
  context?: { bids?: BidData[]; stock?: StockData[] }
): Promise<string> {
  logger.group('OpenAI Teklifbul Assistant Request');
  try {
    // Check API key
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY tanımlı değil, fallback mesajı dönülüyor.');
      console.error('Chat API error: OPENAI_API_KEY is not set in environment variables');
      return 'Üzgünüm, yapay zekâ servisi şu anda yapılandırılmamış görünüyor.';
    }

    // Use the comprehensive SYSTEM_PROMPT constant
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: userMessage
      }
    ];

    // Context varsa ekle (opsiyonel)
    if (context?.bids || context?.stock) {
      messages.push({
        role: 'system',
        content: JSON.stringify({
          type: 'context_data',
          bids: context.bids ?? [],
          stock: context.stock ?? []
        })
      });
    }

    logger.info('Sending request to OpenAI API', {
      model: 'gpt-4o-mini',
      messageLength: userMessage.length
    });

    // OpenAI client oluştur (lazy initialization)
    const openai = getOpenAIClient();

    // OpenAI API çağrısı
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Note: gpt-4.1-mini doesn't exist, using gpt-4o-mini instead
      messages,
      temperature: 0.2,
      max_tokens: 2048
    });

    const reply = response.choices[0]?.message?.content ?? 'Şu anda yanıt veremiyorum.';
    const sanitizedReply = sanitizeAiAnswer(reply);

    logger.info('OpenAI Teklifbul assistant yanıtı üretildi');
    logger.end();
    return sanitizedReply;
  } catch (error: any) {
    // Log full error to console
    console.error('Chat API error (askTeklifbulAssistant):', error);
    logger.error('OpenAI Teklifbul assistant hatası', error);
    logger.end();
    throw new Error(error?.message || 'OpenAI isteği sırasında bir hata oluştu.');
  }
}

/**
 * Teklif verilerini Firestore'dan çek
 * Teklifbul Rule v1.0 - Firestore query limit zorunlu
 */
export async function fetchBidData(filters?: AIPurchaseRequest['filters']): Promise<BidData[]> {
  try {
    logger.group('Fetching Bid Data');
    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore unavailable, returning empty bid data');
      return [];
    }

    const bidsRef = db.collection('bids');
    const query = bidsRef.limit(100); // Teklifbul Rule v1.0 - Limit zorunlu

    // Filtreleme
    if (filters?.firmaAdi) {
      // Firma adına göre filtreleme için supplierId'yi bulmak gerekir
      // Şimdilik basit yaklaşım: tüm teklifleri al
    }

    const snapshot = await query.get();
    const bids: BidData[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      bids.push({
        teklif_no: doc.id,
        firma_adi: data.supplierName || data.supplierId || 'Bilinmeyen',
        urun_kodu: data.items?.[0]?.sku || data.sku || '',
        urun_adi: data.items?.[0]?.name || data.productName || '',
        birim_fiyat: data.items?.[0]?.unitPrice || data.unitPrice || 0,
        para_birimi: data.currency || 'TRY',
        teslim_suresi_gun: data.deliveryDays || data.teslimSuresi || 0,
        odeme_vadesi_gun: data.paymentTerms?.days || data.odemeVadesi || 0,
        minimum_siparis_miktari: data.items?.[0]?.minOrderQty || data.minOrderQty || 0,
        demandId: data.demandId || '',
        createdAt: data.createdAt
      });
    });

    logger.info(`Fetched ${bids.length} bids`);
    logger.end();
    return bids;
  } catch (error: any) {
    logger.error('Error fetching bid data', error);
    return [];
  }
}

/**
 * Stok verilerini Firestore'dan çek
 * Teklifbul Rule v1.0 - Firestore query limit zorunlu
 */
export async function fetchStockData(filters?: AIPurchaseRequest['filters']): Promise<StockData[]> {
  try {
    logger.group('Fetching Stock Data');
    const db = await getAdminDb();
    if (!db) {
      logger.warn('Firestore unavailable, returning empty stock data');
      return [];
    }

    const stockBalancesRef = db.collection('stock_balances');
    let query = stockBalancesRef.limit(100); // Teklifbul Rule v1.0 - Limit zorunlu

    // Filtreleme
    if (filters?.companyId) {
      query = query.where('companyId', '==', filters.companyId);
    }

    const snapshot = await query.get();
    const stocks: StockData[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      stocks.push({
        urun_kodu: data.sku || '',
        urun_adi: data.productName || data.name || '',
        mevcut_stok: data.quantity || 0,
        minimum_stok: data.minStock || data.minimumStock || 0,
        ortalama_gunluk_tuketim: data.avgDailyConsumption || 0,
        tedarik_suresi_gun: data.leadTimeDays || 7,
        locationId: data.locationId || '',
        companyId: data.companyId || ''
      });
    });

    logger.info(`Fetched ${stocks.length} stock records`);
    logger.end();
    return stocks;
  } catch (error: any) {
    logger.error('Error fetching stock data', error);
    return [];
  }
}

/**
 * Satın alma odaklı asistan fonksiyonu
 * - Mevcut endpoint'ler bu fonksiyonu kullanır
 * - İçeride OpenAI tabanlı askTeklifbulAssistant çağrılır
 */
export async function aiPurchase(
  prompt: string,
  bids: BidData[],
  stock: StockData[]
): Promise<string> {
  return askTeklifbulAssistant(prompt, { bids, stock });
}
