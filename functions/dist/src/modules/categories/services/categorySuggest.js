/**
 * Category Suggestion Service
 * Teklifbul Rule v1.0
 *
 * ⚠️ DEPRECATED: Bu dosya artık kullanılmıyor, firestore-categories.ts kullanılıyor
 * Backward compatibility için burada bırakıldı
 *
 * Yeni kod için: import { suggestCategory } from '../../../services/firestore-categories.js'
 *
 * @deprecated Use firestore-categories.ts instead
 */
import { suggestCategory as firestoreSuggestCategory, saveFeedback as firestoreSaveFeedback } from '../../../services/firestore-categories.js';
// Backward compatibility - Firestore servisini kullan
export async function suggestCategory(text) {
    return firestoreSuggestCategory(text);
}
export async function saveFeedback(query, suggestedCategoryId, chosenCategoryId, userId) {
    return firestoreSaveFeedback(query, suggestedCategoryId, chosenCategoryId, userId);
}
