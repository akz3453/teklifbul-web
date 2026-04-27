/**
 * AI Category Guard Service
 * Teklifbul Rule v1.0 - Groq tabanlı kategori doğrulama (maliyet optimizasyonu)
 */

import { sendGroqChat } from '../ai/groqClient.js';
import { logger } from '../../src/shared/log/logger.js';
import { normalizeToIds, getNameById } from '../../src/categories/category-service.js';
import {
  buildMaterialProfileFromItems,
  evaluateCategoryCompatibility,
  suggestCategoriesForProfile
} from '../../category-rules.js';


export interface CategoryGuardItemPreview {
  name: string;
  brandModel?: string;
  unit?: string;
  qty?: number;
}

export interface CategoryGuardRequest {
  userId?: string;
  title: string;
  spec?: string;
  categories: string[];
  items?: CategoryGuardItemPreview[];
}

export interface CategoryGuardResult {
  allowed: boolean;
  reason?: string;
  confidence: number;
  suggestedCategories?: string[];
  matchedCategories?: string[];
  raw?: string;
}

const SYSTEM_PROMPT = `
Sen Nefisoft platformunun kategori doğrulama uzmanısın.
ÖNEMLİ: Sistemin adı Nefisoft'tur. Teklifbul sadece bir modüldür.
Kullanıcıların oluşturduğu satın alma taleplerinin başlığı, açıklaması ve kalemleri ile seçtikleri tedarikçi kategorilerini kontrol edersin.
Kategoriler talebin içeriğiyle alakasızsa uyarı verirsin.
Daima Nefisoft kimliğiyle hareket et.
Her zaman yalnızca aşağıdaki JSON formatında yanıt ver:
{
  "allowed": boolean,
  "confidence": number (0-1 arası),
  "reason": string,
  "matchedCategories": string[],
  "suggestedCategories": string[]
}
`;

// Teklifbul Rule v1.0 - OpenAI kaldırıldı, Groq kullanılıyor

function buildUserPrompt(payload: CategoryGuardRequest): string {
  const { title, spec, categories, items } = payload;
  const lines: string[] = [];

  lines.push(`Talep Başlığı: ${title}`);
  lines.push(`Açıklama / Teknik Şart: ${spec || '-'}`);
  lines.push(`Seçilen Kategori(ler): ${categories?.length ? categories.join(', ') : 'Seçilmemiş'}`);

  if (items && items.length) {
    lines.push('Ana Kalemler:');
    items.slice(0, 10).forEach((item, index) => {
      const detail = [
        item.name || '-',
        item.brandModel ? `Marka/Model: ${item.brandModel}` : null,
        item.qty ? `Miktar: ${item.qty}` : null,
        item.unit ? `Birim: ${item.unit}` : null
      ]
        .filter(Boolean)
        .join(' | ');
      lines.push(`${index + 1}) ${detail}`);
    });
  } else {
    lines.push('Ana Kalemler: Belirtilmemiş');
  }

  lines.push('');
  lines.push('Lütfen seçilen kategorilerin talep içeriğiyle uyumlu olup olmadığını değerlendir.');
  lines.push('Alakasız kategoriler varsa reason içine Türkçe kısa uyarı yaz ve suggestedCategories alanına daha doğru kategori isimlerini ekle.');

  return lines.join('\n');
}

function safeParseResponse(raw: string): CategoryGuardResult {
  if (!raw) {
    throw new Error('Boş AI yanıtı alındı');
  }

  // Try to extract JSON block
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonPayload = jsonMatch ? jsonMatch[0] : raw;
  const parsed = JSON.parse(jsonPayload);

  return {
    allowed: Boolean(parsed.allowed),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    reason: parsed.reason || '',
    matchedCategories: Array.isArray(parsed.matchedCategories) ? parsed.matchedCategories : [],
    suggestedCategories: Array.isArray(parsed.suggestedCategories) ? parsed.suggestedCategories : [],
    raw
  };
}

export async function validateCategorySelection(
  payload: CategoryGuardRequest
): Promise<CategoryGuardResult> {
  logger.group('AI Category Guard');
  try {
    if (!payload?.title) {
      throw new Error('Title is required for category validation');
    }

    const normalizedCategoryIds = normalizeToIds(payload.categories || []);
    const materialProfile = buildMaterialProfileFromItems(payload.items || [], {
      title: payload.title,
      spec: payload.spec
    });
    const compatibility = normalizedCategoryIds.map(id => ({
      id,
      name: getNameById(id) || id,
      result: evaluateCategoryCompatibility(id, materialProfile)
    }));

    const incompatible = compatibility.filter(entry =>
      entry.result && (entry.result.status === 'blocked' || entry.result.status === 'mismatch')
    );

    if (incompatible.length) {
      const reason = incompatible
        .map(entry => entry.result?.reason ? `${entry.name}: ${entry.result.reason}` : entry.name)
        .join(', ');

      logger.warn('Local compatibility guard blocked categories', { incompatible: reason });

      return {
        allowed: false,
        confidence: 1,
        reason: reason || 'Kategori seçimi malzeme tanımıyla uyumsuz.',
        matchedCategories: compatibility
          .filter(entry => entry.result?.status === 'compatible')
          .map(entry => entry.name),
        suggestedCategories: suggestCategoriesForProfile(materialProfile, 3)
          .map(id => getNameById(id) || id)
      };
    }

    const userPrompt = buildUserPrompt(payload);

    logger.info('Sending request to Groq Category Guard', {
      hasSpec: Boolean(payload.spec),
      categoryCount: payload.categories?.length || 0,
      itemCount: payload.items?.length || 0
    });

    // Teklifbul Rule v1.0 - Groq kullan (maliyet düşük)
    const result = await sendGroqChat(
      [{ role: 'user', content: userPrompt }],
      {
        systemPrompt: SYSTEM_PROMPT,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        maxTokens: 500
      }
    );

    const parsed = safeParseResponse(result.text);

    logger.info('Category guard decision', {
      allowed: parsed.allowed,
      confidence: parsed.confidence,
      reason: parsed.reason
    });

    return parsed;
  } catch (error: any) {
    logger.error('AI Category Guard error', error);
    throw new Error(error?.message || 'Kategori doğrulama başarısız oldu');
  } finally {
    logger.end();
  }
}

