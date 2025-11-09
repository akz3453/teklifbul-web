/**
 * Category Suggestion Service
 * Teklifbul Rule v1.0
 * 
 * Firestore + In-Memory Cache kullanıyor - $0 maliyet
 * Skor hesaplama: 0.6*rule + 0.4*semantic (semantic için embedding gerekli, şimdilik rule-only)
 * 
 * NOT: Bu dosya artık kullanılmıyor, firestore-categories.ts kullanılıyor
 * Backward compatibility için burada bırakıldı
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

