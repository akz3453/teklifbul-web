// Teklifbul Rule v1.0 - Adres tip tanımları
export type Address = {
  ulke: string;      // "Türkiye" varsayılan
  il: string;
  ilce: string;
  mahalle?: string;
  sokak?: string;    // manuel veya select sonucu; tercih sırası: manuel > select
  cadde?: string;
  kapiNo?: string;
  daire?: string;
  postaKodu?: string;
  // yardımcı
  composed?: string; // gösterim için
};

