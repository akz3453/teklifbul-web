/**
 * Firestore Categories Service
 * Teklifbul Rule v1.0 - Structured Logging
 * 
 * PostgreSQL alternatifi - $0 maliyet, otomatik yedekleme
 */

import { db } from '../lib/firebase';
import { logger } from '../shared/log/logger.js';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { cache } from './in-memory-cache';

interface Category {
  id: string;
  name: string;
  short_desc?: string;
  examples?: string[];
  createdAt?: any;
  updatedAt?: any;
}

interface CategoryKeyword {
  id: string;
  category_id: number;
  keyword: string;
  weight: number;
}

interface Suggestion {
  category_id: number;
  name: string;
  score: number;
  reasons: string[];
}

/**
 * Türkçe normalizasyon
 */
function normalizeTurkish(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Diacritics
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kategorileri listele
 */
export async function getCategories(options?: {
  search?: string;
  withDesc?: boolean;
  page?: number;
  size?: number;
}): Promise<{ data: Category[]; pagination: any }> {
  const { search, withDesc = true, page = 1, size = 100 } = options || {};
  
  // Cache key
  const cacheKey = `categories:list:${search || 'all'}:${page}:${size}`;
  
  // Cache kontrolü
  const cached = await cache.get<{ data: Category[]; pagination: any }>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const categoriesRef = collection(db, 'categories');
    
    // Search varsa: Tüm kategorileri çekip client-side filter (case-insensitive gerekli)
    // Search yoksa: Firestore pagination kullan (daha hızlı)
    if (search) {
      // Search için tüm kategorileri çek (case-insensitive filter gerekli)
      const q = query(categoriesRef, orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      let categories = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      
      // Client-side search filter
      const searchLower = search.toLowerCase();
      categories = categories.filter(cat => 
        cat.name.toLowerCase().includes(searchLower) ||
        cat.short_desc?.toLowerCase().includes(searchLower)
      );
      
      // Pagination
      const startIndex = (page - 1) * size;
      const endIndex = startIndex + size;
      const paginated = categories.slice(startIndex, endIndex);
      
      // withDesc kontrolü
      const result = withDesc 
        ? paginated 
        : paginated.map(({ short_desc, examples, ...rest }) => rest);
      
      const response = {
        data: result,
        pagination: {
          page,
          size,
          total: categories.length
        }
      };
      
      // Cache'e kaydet (5 dakika)
      await cache.set(cacheKey, response, 300);
      
      return response;
    } else {
      // Search yoksa: Firestore pagination kullan (daha performanslı)
      const q = query(
        categoriesRef,
        orderBy('name', 'asc'),
        limit(size)
      );
      
      const snapshot = await getDocs(q);
      let categories = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      
      // withDesc kontrolü
      const result = withDesc 
        ? categories 
        : categories.map(({ short_desc, examples, ...rest }) => rest);
      
      // Total count için ayrı sorgu (sadece ilk sayfa için gerekli)
      // Not: Firestore'da total count için ayrı sorgu gerekir, bu pahalı olabilir
      // Bu yüzden sadece ilk sayfa için total count gösteriyoruz
      const totalCount = page === 1 ? snapshot.size : undefined;
      
      const response = {
        data: result,
        pagination: {
          page,
          size,
          total: totalCount ?? result.length // Yaklaşık değer
        }
      };
      
      // Cache'e kaydet (5 dakika)
      await cache.set(cacheKey, response, 300);
      
      return response;
    }
  } catch (error: any) {
    logger.error('❌ Firestore getCategories error:', error);
    throw new Error(`Kategoriler yüklenemedi: ${error.message}`);
  }
}

/**
 * Kategori detayı
 */
export async function getCategoryById(id: string): Promise<Category | null> {
  const cacheKey = `category:${id}`;
  
  // Cache kontrolü
  const cached = await cache.get<Category>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const categoryDoc = await getDoc(doc(db, 'categories', id));
    
    if (!categoryDoc.exists()) {
      return null;
    }
    
    const category = {
      id: categoryDoc.id,
      ...categoryDoc.data()
    } as Category;
    
    // Cache'e kaydet (1 saat)
    await cache.set(cacheKey, category, 3600);
    
    return category;
  } catch (error: any) {
    logger.error('❌ Firestore getCategoryById error:', error);
    throw new Error(`Kategori yüklenemedi: ${error.message}`);
  }
}

/**
 * Kategori öner
 */
export async function suggestCategory(text: string): Promise<{
  query: string;
  suggestions: Suggestion[];
  auto_select: string | null;
}> {
  const normalized = normalizeTurkish(text.toLowerCase());
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) {
    return { query: text, suggestions: [], auto_select: null };
  }
  
  // Cache key
  const cacheKey = `cat:suggest:${normalized}`;
  
  // Cache kontrolü
  const cached = await cache.get<{ query: string; suggestions: Suggestion[]; auto_select: string | null }>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    // Tüm keywords'leri al
    const keywordsRef = collection(db, 'category_keywords');
    const keywordsSnapshot = await getDocs(keywordsRef);
    const keywords = keywordsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as CategoryKeyword[];
    
    // Keyword matching
    const matches = keywords.filter(kw => {
      const kwLower = kw.keyword.toLowerCase();
      return words.some(word => kwLower.includes(word) || word.includes(kwLower));
    });
    
    // Category scores hesapla
    const categoryScores = new Map<number, { score: number; keywords: string[] }>();
    
    matches.forEach(match => {
      const catId = match.category_id;
      const current = categoryScores.get(catId) || { score: 0, keywords: [] };
      current.score += match.weight;
      current.keywords.push(match.keyword);
      categoryScores.set(catId, current);
    });
    
    // Top 5 kategori al ve detaylarını getir
    const topCategories = Array.from(categoryScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 5);
    
    const suggestions: Suggestion[] = await Promise.all(
      topCategories.map(async ([catId, data]) => {
        // Kategori detayını al
        const category = await getCategoryById(catId.toString());
        
        const ruleScore = Math.min(data.score / 10, 1.0); // Normalize to 0-1
        
        return {
          category_id: catId,
          name: category?.name || '',
          score: Math.round(ruleScore * 100) / 100,
          reasons: data.keywords.slice(0, 3) // Top 3 keywords
        };
      })
    );
    
    // Auto-select if score >= 0.70
    const autoSelect = suggestions.length > 0 && suggestions[0].score >= 0.70
      ? suggestions[0].name
      : null;
    
    const result = {
      query: text,
      suggestions,
      auto_select: autoSelect
    };
    
    // Cache'e kaydet (24 saat)
    await cache.set(cacheKey, result, 86400);
    
    return result;
  } catch (error: any) {
    logger.error('❌ Firestore suggestCategory error:', error);
    throw new Error(`Kategori önerisi oluşturulamadı: ${error.message}`);
  }
}

/**
 * Feedback kaydet
 */
export async function saveFeedback(
  query: string,
  suggestedCategoryId: number | null,
  chosenCategoryId: number | null,
  userId?: string
): Promise<void> {
  try {
    await addDoc(collection(db, 'category_feedback'), {
      query,
      suggested_category_id: suggestedCategoryId,
      chosen_category_id: chosenCategoryId,
      user_id: userId || null,
      createdAt: new Date()
    });
  } catch (error: any) {
    logger.error('❌ Firestore saveFeedback error:', error);
    throw new Error(`Feedback kaydedilemedi: ${error.message}`);
  }
}

