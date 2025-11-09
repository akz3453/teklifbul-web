/**
 * Category Service - ID-based category management
 * CRITICAL: Eşleşme sadece ID üzerinden yapılır. Name/slug sadece UI/arama için kullanılır.
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../shared/log/logger.js';

// Import slugifyTr with absolute path from root
import { slugifyTr } from '/utils/slugify-tr.js';

// Hardcoded categories (fallback - always available)
const FALLBACK_CATEGORIES = [
  {"id":"CAT.SACMETAL","slug":"sac-metal","name":"Sac/Metal","group":"Endüstriyel","synonyms":["sac","metal","çelik işleme"],"isActive":true},
  {"id":"CAT.ELEKTRIK","slug":"elektrik","name":"Elektrik","group":"Elektrik-ELK","synonyms":["elektrik malzemeleri"],"isActive":true},
  {"id":"CAT.ELEKTRONIK","slug":"elektronik","name":"Elektronik","group":"Elektrik-ELK","synonyms":["plc","sensor"],"isActive":true},
  {"id":"CAT.MAKINEIMALAT","slug":"makine-imalat","name":"Makine-İmalat","group":"Endüstriyel","synonyms":["imalat","cnc"],"isActive":true},
  {"id":"CAT.HIRDAVAT","slug":"hirdavat","name":"Hırdavat","group":"Endüstriyel","synonyms":["vida","somun"],"isActive":true},
  {"id":"CAT.AMBALAJ","slug":"ambalaj","name":"Ambalaj","group":"Genel","synonyms":["koli","streç"],"isActive":true},
  {"id":"CAT.KIMYASAL","slug":"kimyasal","name":"Kimyasal","group":"Endüstriyel","synonyms":["solvent"],"isActive":true},
  {"id":"CAT.INSAAT","slug":"insaat-malzemeleri","name":"İnşaat Malzemeleri","group":"İnşaat","synonyms":["yapı"],"isActive":true},
  {"id":"CAT.MOBILYA","slug":"mobilya","name":"Mobilya","group":"Genel","synonyms":["ofis mobilyası"],"isActive":true},
  {"id":"CAT.BOYA","slug":"boya","name":"Boya","group":"Endüstriyel","synonyms":["endüstriyel boya"],"isActive":true},
  {"id":"CAT.PLASTIK","slug":"plastik","name":"Plastik","group":"Endüstriyel","synonyms":["plastik hammadde"],"isActive":true},
  {"id":"CAT.OTOMOTIVYS","slug":"otomotiv-yan-sanayi","name":"Otomotiv Yan Sanayi","group":"Endüstriyel","synonyms":["otomotiv parça"],"isActive":true},
  {"id":"CAT.ISG","slug":"is-guvenligi","name":"İş Güvenliği","group":"İSG","synonyms":["kkd","baret"],"isActive":true},
  {"id":"CAT.TEMIZLIK","slug":"temizlik","name":"Temizlik","group":"Genel","synonyms":["temizlik ekipmanı"],"isActive":true},
  {"id":"CAT.GIDA","slug":"gida","name":"Gıda","group":"Genel","synonyms":["ikram"],"isActive":true},
  {"id":"CAT.HIZMET","slug":"hizmet","name":"Hizmet","group":"Hizmet","synonyms":["bakım","işçilik"],"isActive":true},
  {"id":"CAT.LOJISTIK","slug":"lojistik","name":"Lojistik","group":"Hizmet","synonyms":["nakliye"],"isActive":true},
  {"id":"CAT.AYDINLATMA","slug":"aydinlatma","name":"Aydınlatma","group":"Elektrik-ELK","synonyms":["armatur","projektor"],"isActive":true},
  {"id":"CAT.AGMG","slug":"alcak-orta-gerilim","name":"Alçak/Orta Gerilim","group":"Elektrik-ELK","synonyms":["pano","şalt","trafo"],"isActive":true},
  {"id":"CAT.OTOMASYON","slug":"otomasyon-plc-scada","name":"Otomasyon (PLC/SCADA)","group":"Elektrik-ELK","synonyms":["plc","hmi","sürücü"],"isActive":true},
  {"id":"CAT.KAYNAK","slug":"kaynak-sarf","name":"Kaynak & Sarf","group":"Endüstriyel","synonyms":["mig","tig","kaynak teli"],"isActive":true},
  {"id":"CAT.RULMAN","slug":"rulman-guc-aktarim","name":"Rulman & Güç Aktarım","group":"Endüstriyel","synonyms":["kayış","kaplin","redüktör"],"isActive":true},
  {"id":"CAT.HVAC","slug":"iklimlendirme-havalandirma","name":"HVAC","group":"MEP","synonyms":["vrf","kanal","fan"],"isActive":true},
  {"id":"CAT.YANGIN","slug":"yangin-guvenligi","name":"Yangın Güvenliği","group":"MEP","synonyms":["sprinkler","algılama"],"isActive":true},
  {"id":"CAT.KIRALAMA","slug":"ekipman-kiralama","name":"Ekipman Kiralama","group":"Hizmet","synonyms":["forklift","vinç"],"isActive":true}
];

// Dictionary data - try to load from JSON, fallback to hardcoded
let dictionaryData = null;

// Initialize dictionaryData with fallback (simplified for Vite compatibility)
// Technifire Rule v1.0: Using hardcoded fallback to avoid async issues
dictionaryData = FALLBACK_CATEGORIES;

// Cache dictionary
let categoryDictionary = null;
let categoryMapById = null;
let categoryMapBySlug = null;
let categoryMapByName = null;

/**
 * Load and cache category dictionary
 */
export function loadDictionary() {
  if (categoryDictionary) {
    return categoryDictionary;
  }

  // Ensure dictionaryData is loaded
  if (!dictionaryData) {
    // Try synchronous load first (for Node.js)
    if (typeof require !== 'undefined' && typeof process !== 'undefined') {
      try {
        const fs = require('fs');
        const path = require('path');
        const dictPath = path.join(__dirname, 'CATEGORY_DICTIONARY.json');
        const data = fs.readFileSync(dictPath, 'utf8');
        dictionaryData = JSON.parse(data);
      } catch (e) {
        dictionaryData = FALLBACK_CATEGORIES;
      }
    } else {
      // Browser: use fallback (will be async loaded later if needed)
      dictionaryData = FALLBACK_CATEGORIES;
    }
  }

  categoryDictionary = dictionaryData.filter(cat => cat.isActive !== false);
  
  // Build lookup maps
  categoryMapById = new Map();
  categoryMapBySlug = new Map();
  categoryMapByName = new Map();
  
  categoryDictionary.forEach(cat => {
    categoryMapById.set(cat.id, cat);
    categoryMapBySlug.set(cat.slug, cat);
    categoryMapByName.set(cat.name.toLowerCase(), cat);
    
    // Also map normalized names
    const normalizedName = cat.name.toLowerCase().trim();
    categoryMapByName.set(normalizedName, cat);
  });
  
  return categoryDictionary;
}

/**
 * Get category by ID
 */
export function getById(id) {
  if (!categoryMapById) loadDictionary();
  return categoryMapById.get(id) || null;
}

/**
 * Get category ID by name (case-insensitive)
 */
export function getIdByName(name) {
  if (!name) return null;
  if (!categoryMapByName) loadDictionary();
  const cat = categoryMapByName.get(name.toLowerCase().trim());
  return cat ? cat.id : null;
}

/**
 * Get category ID by slug
 */
export function getIdBySlug(slug) {
  if (!slug) return null;
  if (!categoryMapBySlug) loadDictionary();
  const cat = categoryMapBySlug.get(slug);
  return cat ? cat.id : null;
}

/**
 * Get category name by ID (for UI display)
 */
export function getNameById(id) {
  const cat = getById(id);
  return cat ? cat.name : id;
}

/**
 * Get category slug by ID (for URL/search)
 */
export function getSlugById(id) {
  const cat = getById(id);
  return cat ? cat.slug : null;
}

/**
 * Search categories by text (name + synonyms)
 * Returns array of category IDs
 */
export function search(text) {
  if (!text || typeof text !== 'string') return [];
  if (!categoryDictionary) loadDictionary();
  
  const searchLower = text.toLowerCase().trim();
  const results = new Set();
  
  categoryDictionary.forEach(cat => {
    // Match name
    if (cat.name.toLowerCase().includes(searchLower)) {
      results.add(cat.id);
      return;
    }
    
    // Match slug
    if (cat.slug.includes(searchLower)) {
      results.add(cat.id);
      return;
    }
    
    // Match synonyms
    if (cat.synonyms && Array.isArray(cat.synonyms)) {
      for (const synonym of cat.synonyms) {
        if (synonym.toLowerCase().includes(searchLower)) {
          results.add(cat.id);
          return;
        }
      }
    }
  });
  
  return Array.from(results);
}

/**
 * CRITICAL: Normalize input tokens to category IDs
 * This is the core function for converting any format (ID/name/slug) to IDs
 * 
 * @param {string[]} inputTokens - Array of category IDs, names, or slugs
 * @returns {string[]} Array of valid category IDs
 */
export function normalizeToIds(inputTokens) {
  if (!Array.isArray(inputTokens)) {
    logger.warn('normalizeToIds: inputTokens must be an array', inputTokens);
    return [];
  }
  
  if (!categoryDictionary) loadDictionary();
  
  // Legacy incorrect slug map (for fixing old data)
  const incorrectSlugMap = {
    'gda': 'CAT.GIDA',
    'hrdavat': 'CAT.HIRDAVAT',
    'inaat-malzemeleri': 'CAT.INSAAT',
    'i-gvenlii': 'CAT.ISG',
    'sacmetal': 'CAT.SACMETAL',
    'makine-imalat': 'CAT.MAKINEIMALAT',
    'insaat-malzemeleri': 'CAT.INSAAT',
    'is-guvenligi': 'CAT.ISG',
    'otomotiv-yan-sanayi': 'CAT.OTOMOTIVYS',
    // CRITICAL: Fix incorrect Turkish character normalization in category groups
    'aydnlatma': 'CAT.AYDINLATMA',           // ı eksik -> aydinlatma
    'alakorta-gerilim': 'CAT.AGMG',          // ç eksik -> alcak-orta-gerilim
    'otomasyon-plcscada': 'CAT.OTOMASYON',   // tire eksik -> otomasyon-plc-scada
    'rulman-g-aktarm': 'CAT.RULMAN',         // ü ve u eksik -> rulman-guc-aktarim
    'yangn-gvenlii': 'CAT.YANGIN',           // i ve ü eksik -> yangin-guvenligi
    'cat_sac_metal': 'CAT.SACMETAL',
    'cat_elektrik': 'CAT.ELEKTRIK',
    'cat_elektronik': 'CAT.ELEKTRONIK',
    'cat_makine_imalat': 'CAT.MAKINEIMALAT',
    'cat_hirdavat': 'CAT.HIRDAVAT',
    'cat_ambalaj': 'CAT.AMBALAJ',
    'cat_kimyasal': 'CAT.KIMYASAL',
    'cat_insaat_malzemeleri': 'CAT.INSAAT',
    'cat_mobilya': 'CAT.MOBILYA',
    'cat_boya': 'CAT.BOYA',
    'cat_plastik': 'CAT.PLASTIK',
    'cat_otomotiv_yan_sanayi': 'CAT.OTOMOTIVYS',
    'cat_is_guvenligi': 'CAT.ISG',
    'cat_temizlik': 'CAT.TEMIZLIK',
    'cat_gida': 'CAT.GIDA',
    'cat_hizmet': 'CAT.HIZMET',
    'cat_lojistik': 'CAT.LOJISTIK'
  };
  
  const resultIds = new Set();
  
  for (const token of inputTokens) {
    if (!token || typeof token !== 'string') continue;
    
    const tokenTrimmed = token.trim();
    if (!tokenTrimmed) continue;
    
    // 1. Direct ID check (if it starts with CAT.)
    if (tokenTrimmed.startsWith('CAT.')) {
      const cat = getById(tokenTrimmed);
      if (cat) {
        resultIds.add(cat.id);
        continue;
      }
    }
    
    // 2. Check old ID format (cat_xxx)
    if (tokenTrimmed.startsWith('cat_')) {
      const mappedId = incorrectSlugMap[tokenTrimmed];
      if (mappedId) {
        resultIds.add(mappedId);
        continue;
      }
    }
    
    // 3. Try name lookup (case-insensitive)
    const idByName = getIdByName(tokenTrimmed);
    if (idByName) {
      resultIds.add(idByName);
      continue;
    }
    
    // 4. Try slug lookup
    const idBySlug = getIdBySlug(tokenTrimmed);
    if (idBySlug) {
      resultIds.add(idBySlug);
      continue;
    }
    
    // 5. Try legacy incorrect slug map
    const mappedId = incorrectSlugMap[tokenTrimmed.toLowerCase()];
    if (mappedId) {
      resultIds.add(mappedId);
      continue;
    }
    
    // 6. Try normalized slug (slugify input and match)
    const normalizedSlug = slugifyTr(tokenTrimmed);
    if (normalizedSlug) {
      const idByNormalizedSlug = getIdBySlug(normalizedSlug);
      if (idByNormalizedSlug) {
        resultIds.add(idByNormalizedSlug);
        continue;
      }
    }
    
    // 7. Not found - warn but don't fail
    logger.warn('Unknown category token', { token: tokenTrimmed });
  }
  
  return Array.from(resultIds);
}

/**
 * Get all active categories
 */
export function getAllCategories() {
  if (!categoryDictionary) loadDictionary();
  return [...categoryDictionary];
}

/**
 * Get all category IDs
 */
export function getAllIds() {
  if (!categoryDictionary) loadDictionary();
  return categoryDictionary.map(cat => cat.id);
}

/**
 * Get categories by group
 */
export function getByGroup(group) {
  if (!categoryDictionary) loadDictionary();
  return categoryDictionary.filter(cat => cat.group === group);
}

/**
 * Get all unique groups
 */
export function getAllGroups() {
  if (!categoryDictionary) loadDictionary();
  const groups = new Set(categoryDictionary.map(cat => cat.group));
  return Array.from(groups);
}

/**
 * Create new category (with auto-generated ID)
 * Note: In a production system, this would also save to Firestore or update JSON file
 * 
 * @param {object} params - {name, group, synonyms?, slug?}
 * @returns {object} Created category with ID
 */
export function createCategory({ name, group, synonyms = [], slug = null }) {
  if (!name || !group) {
    throw new Error('name and group are required');
  }
  
  // Generate ID: CAT. + 6-digit sequential number
  // In production, get next sequence from Firestore or persistent storage
  const existingIds = getAllIds();
  const maxNum = existingIds.reduce((max, id) => {
    const match = id.match(/^CAT\.(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }
    return max;
  }, 0);
  
  const nextNum = maxNum + 1;
  const newId = `CAT.${String(nextNum).padStart(6, '0')}`;
  
  // Generate slug if not provided
  const categorySlug = slug || slugifyTr(name);
  
  const newCategory = {
    id: newId,
    slug: categorySlug,
    name: name,
    group: group,
    synonyms: Array.isArray(synonyms) ? synonyms : [],
    isActive: true
  };
  
  // In production: Save to Firestore or update JSON file
  // For now, just add to cache (will be lost on reload)
  if (categoryDictionary) {
    categoryDictionary.push(newCategory);
    categoryMapById.set(newId, newCategory);
    categoryMapBySlug.set(categorySlug, newCategory);
    categoryMapByName.set(name.toLowerCase(), newCategory);
  }
  
  logger.info('Created new category', { id: newId, name });
  
  return newCategory;
}

// Initialize on module load
loadDictionary();

