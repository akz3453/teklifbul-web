/**
 * AI Token Pack Catalog
 * Teklifbul Rule v1.0 - Token Pack Pricing Catalog
 *
 * OpenAI ve Gemini için token paket fiyat listesi
 */
/**
 * OpenAI Token Paketleri
 * GPT-4o-mini için paketler
 * Fiyatlar KDV dahil, Premium paket fiyatı hariç
 */
export const OPENAI_TOKEN_PACKS = [
    {
        id: 'openai_plus_1',
        name: 'PLUS-1',
        provider: 'openai',
        tokenAmount: 1000000, // 1M token
        price: 79, // ₺79 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 1000,
        description: 'Küçük işletmeler için ideal başlangıç paketi',
        includesPremium: true
    },
    {
        id: 'openai_plus_2',
        name: 'PLUS-2',
        provider: 'openai',
        tokenAmount: 3000000, // 3M token
        price: 199, // ₺199 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 3000,
        description: 'Orta ölçekli kullanım için uygun',
        includesPremium: true
    },
    {
        id: 'openai_plus_3',
        name: 'PLUS-3',
        provider: 'openai',
        tokenAmount: 7000000, // 7M token
        price: 419, // ₺419 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 7000,
        description: 'Yoğun kullanım için ekonomik paket',
        includesPremium: true
    },
    {
        id: 'openai_plus_4',
        name: 'PLUS-4',
        provider: 'openai',
        tokenAmount: 15000000, // 15M token
        price: 849, // ₺849 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 15000,
        description: 'Büyük ekipler için uygun',
        includesPremium: true
    },
    {
        id: 'openai_plus_5',
        name: 'PLUS-5',
        provider: 'openai',
        tokenAmount: 30000000, // 30M token
        price: 1499, // ₺1,499 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 30000,
        description: 'Kurumsal kullanım için en avantajlı paket',
        includesPremium: true
    }
];
/**
 * Gemini Token Paketleri
 * Gemini 3.0 Pro için paketler
 * Mesaj bazlı paketler (ortalama 300 token/mesaj hesaplaması ile)
 * Fiyatlar KDV dahil, Premium paket fiyatı hariç
 */
export const GEMINI_TOKEN_PACKS = [
    {
        id: 'gemini_mini',
        name: 'Mini Paket',
        provider: 'gemini',
        tokenAmount: 15000, // ~50 mesaj * 300 token
        price: 109, // ₺109 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 50,
        description: 'Küçük işletmeler için ideal başlangıç paketi',
        includesPremium: true
    },
    {
        id: 'gemini_temel',
        name: 'Temel Paket',
        provider: 'gemini',
        tokenAmount: 30000, // ~100 mesaj * 300 token
        price: 219, // ₺219 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 100,
        description: 'Orta ölçekli kullanım için uygun',
        includesPremium: true
    },
    {
        id: 'gemini_standart',
        name: 'Standart Paket',
        provider: 'gemini',
        tokenAmount: 60000, // ~200 mesaj * 300 token
        price: 439, // ₺439 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 200,
        description: 'Yoğun kullanım için ekonomik paket',
        includesPremium: true
    },
    {
        id: 'gemini_guclu',
        name: 'Güç Paketi',
        provider: 'gemini',
        tokenAmount: 150000, // ~500 mesaj * 300 token
        price: 1089, // ₺1,089 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 500,
        description: 'Büyük ekipler için uygun',
        includesPremium: true
    },
    {
        id: 'gemini_ultra',
        name: 'Ultra Paket',
        provider: 'gemini',
        tokenAmount: 300000, // ~1,000 mesaj * 300 token
        price: 2169, // ₺2,169 (KDV dahil)
        currency: 'TRY',
        estimatedMessages: 1000,
        description: 'Kurumsal kullanım için en avantajlı paket',
        includesPremium: true
    }
];
/**
 * Tüm token paketlerini döndürür
 */
export function getAllTokenPacks() {
    return [...OPENAI_TOKEN_PACKS, ...GEMINI_TOKEN_PACKS];
}
/**
 * Provider'a göre token paketlerini döndürür
 */
export function getTokenPacksByProvider(provider) {
    return provider === 'openai' ? OPENAI_TOKEN_PACKS : GEMINI_TOKEN_PACKS;
}
/**
 * Paket ID'sine göre paket tanımını döndürür
 */
export function getTokenPackById(id) {
    const allPacks = getAllTokenPacks();
    return allPacks.find(pack => pack.id === id) || null;
}
