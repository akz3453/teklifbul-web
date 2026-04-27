// src/shared/constants/aiTokenPacks.js
// Teklifbul Rule v1.0 - AI Token Paketleri (tek kaynak)

export const AI_TOKEN_PACKS = {
  openai_gpt4o_mini: {
    title: "OpenAI GPT-4o-mini Paketleri",
    note: "İlk satın almada Premium Plus paket fiyatı (₺379) + Token paket fiyatı ödenir. Token paketi yenileme durumunda sadece token paket fiyatı ödenir.",
    rows: [
      { code: "PLUS-1", tokens: "1M",  approxMessages: "~1000 mesaj",  priceTry: 79 },
      { code: "PLUS-2", tokens: "3M",  approxMessages: "~3000 mesaj",  priceTry: 199 },
      { code: "PLUS-3", tokens: "7M",  approxMessages: "~7000 mesaj",  priceTry: 419 },
      { code: "PLUS-4", tokens: "15M", approxMessages: "~15000 mesaj", priceTry: 849 },
      { code: "PLUS-5", tokens: "30M", approxMessages: "~30000 mesaj", priceTry: 1499 }
    ]
  },
  google_gemini_3: {
    title: "Google Gemini 3.0 Paketleri",
    note: "İlk satın almada Premium Plus paket fiyatı (₺379) + Token paket fiyatı ödenir. Token paketi yenileme durumunda sadece token paket fiyatı ödenir.",
    rows: [
      { name: "Mini Paket",    messages: "50 mesaj",   priceTry: 109 },
      { name: "Temel Paket",   messages: "100 mesaj",  priceTry: 219 },
      { name: "Standart Paket",messages: "200 mesaj",  priceTry: 439 },
      { name: "Güç Paketi",    messages: "500 mesaj",  priceTry: 1089 },
      { name: "Ultra Paket",   messages: "1,000 mesaj",priceTry: 2169 }
    ]
  }
};
