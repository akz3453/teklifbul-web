// Shared category dictionary with IDs for the entire application
// Using IDs from CATEGORY_DICTIONARY.json for reliable matching
// Teklifbul Rule v1.0 - 25 categories with unique IDs
// Each category has a unique ID (e.g., CAT.LOJISTIK) that avoids Turkish character issues
// IDs are used for matching, names are used for display

export const CATEGORIES = [
  { id: 'CAT.SACMETAL', name: 'Sac/Metal' },
  { id: 'CAT.ELEKTRIK', name: 'Elektrik' },
  { id: 'CAT.ELEKTRONIK', name: 'Elektronik' },
  { id: 'CAT.MAKINEIMALAT', name: 'Makine-İmalat' },
  { id: 'CAT.HIRDAVAT', name: 'Hırdavat' },
  { id: 'CAT.AMBALAJ', name: 'Ambalaj' },
  { id: 'CAT.KIMYASAL', name: 'Kimyasal' },
  { id: 'CAT.INSAAT', name: 'İnşaat Malzemeleri' },
  { id: 'CAT.MOBILYA', name: 'Mobilya' },
  { id: 'CAT.BOYA', name: 'Boya' },
  { id: 'CAT.PLASTIK', name: 'Plastik' },
  { id: 'CAT.OTOMOTIVYS', name: 'Otomotiv Yan Sanayi' },
  { id: 'CAT.ISG', name: 'İş Güvenliği' },
  { id: 'CAT.TEMIZLIK', name: 'Temizlik' },
  { id: 'CAT.GIDA', name: 'Gıda' },
  { id: 'CAT.HIZMET', name: 'Hizmet' },
  { id: 'CAT.LOJISTIK', name: 'Lojistik' },
  { id: 'CAT.AYDINLATMA', name: 'Aydınlatma' },
  { id: 'CAT.AGMG', name: 'Alçak/Orta Gerilim' },
  { id: 'CAT.OTOMASYON', name: 'Otomasyon (PLC/SCADA)' },
  { id: 'CAT.KAYNAK', name: 'Kaynak & Sarf' },
  { id: 'CAT.RULMAN', name: 'Rulman & Güç Aktarım' },
  { id: 'CAT.HVAC', name: 'HVAC' },
  { id: 'CAT.YANGIN', name: 'Yangın Güvenliği' },
  { id: 'CAT.KIRALAMA', name: 'Ekipman Kiralama' }
];

// Helper functions
export function getCategoryById(id) {
  return CATEGORIES.find(cat => cat.id === id);
}

export function getCategoryNameById(id) {
  const cat = getCategoryById(id);
  return cat ? cat.name : id; // Fallback to ID if not found
}

export function getCategoryIdByName(name) {
  const cat = CATEGORIES.find(cat => cat.name === name || cat.name.toLowerCase() === name.toLowerCase());
  return cat ? cat.id : null;
}

export function getAllCategoryIds() {
  return CATEGORIES.map(cat => cat.id);
}

export function getAllCategoryNames() {
  return CATEGORIES.map(cat => cat.name);
}

// Legacy support: export names array for backward compatibility
export const CATEGORY_NAMES = CATEGORIES.map(cat => cat.name);
