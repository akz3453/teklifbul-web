/**
 * Category Suggestion Service
 * Teklifbul Rule v1.0
 * 
 * ⚠️ DEPRECATED: Bu dosya artık kullanılmıyor, firestore-categories.ts kullanılıyor
 * Backward compatibility için burada bırakıldı
 * 
 * Yeni kod için: import { suggestCategory } from '../../../services/firestore-categories'
 * 
 * @deprecated Use firestore-categories.ts instead
 */

import { suggestCategory as firestoreSuggestCategory, saveFeedback as firestoreSaveFeedback } from '../../../services/firestore-categories';

// Backward compatibility - Firestore servisini kullan
export async function suggestCategory(text: string) {
  return firestoreSuggestCategory(text);
}

export async function saveFeedback(
  query: string,
  suggestedCategoryId: number | null,
  chosenCategoryId: number | null,
  userId?: string
): Promise<void> {
  return firestoreSaveFeedback(query, suggestedCategoryId, chosenCategoryId, userId);
}

