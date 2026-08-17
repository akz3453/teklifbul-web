/**
 * AI Error Analysis Service
 * Teklifbul Rule v1.0 - Hata analizi için yapay zeka entegrasyonu
 *
 * Hataları yapay zeka ile analiz eder ve çözüm önerileri üretir
 * OpenAI GPT-4o-mini veya Gemini 3.0 Pro kullanır
 */
import { logger } from '../../src/shared/log/logger.js';
import { sendChat } from '../ai/index.js';
import { getUserAIProvider } from './userService.js';
/**
 * Tek hata analizi - AI ile
 */
export async function analyzeError(errorData, userId) {
    logger.group('ai-error-analysis:single');
    try {
        const message = errorData.message || 'Unknown error';
        const code = errorData.code || '';
        const stack = errorData.stack || '';
        const type = errorData.type || 'unknown';
        const severity = errorData.severity || 'medium';
        const url = errorData.url || errorData.path || '';
        const userAgent = errorData.userAgent || '';
        // AI provider seçimi
        let provider = 'gemini'; // Varsayılan: Gemini (daha ucuz)
        if (userId) {
            try {
                provider = await getUserAIProvider(userId);
            }
            catch (err) {
                logger.warn('User AI provider alınamadı, varsayılan kullanılıyor', { userId, error: err });
            }
        }
        // AI prompt oluştur
        const systemPrompt = `Sen bir yazılım hata analiz uzmanısın. Hataları analiz edip özet çıkar ve çözüm önerileri sun. 
Yanıtını Türkçe olarak ver. Yanıt formatı JSON olmalı: {"summary": "...", "suggestedFix": "...", "confidence": 0.0-1.0 arası sayı}`;
        const userPrompt = `Aşağıdaki hatayı analiz et ve çözüm öner:

HATA BİLGİLERİ:
- Tip: ${type}
- Önem: ${severity}
- Mesaj: ${message}
- Kod: ${code || 'Yok'}
- URL/Path: ${url || 'Yok'}
- Stack Trace: ${stack ? stack.substring(0, 1000) : 'Yok'}
${userAgent ? `- User Agent: ${userAgent.substring(0, 200)}` : ''}

Lütfen şu formatta JSON yanıt ver:
{
  "summary": "Hatanın kısa özeti (2-3 cümle)",
  "suggestedFix": "Önerilen çözüm adımları (detaylı)",
  "confidence": 0.85
}`;
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
        logger.info('Sending error analysis request to AI', { provider, errorType: type, severity });
        // AI çağrısı
        const aiResponse = await sendChat(messages, {
            provider,
            systemPrompt,
            temperature: 0.3, // Daha tutarlı yanıtlar için düşük temperature
            maxTokens: 1000
        });
        // JSON parse et
        let analysis;
        try {
            // AI yanıtından JSON çıkar (markdown code block varsa temizle)
            let jsonText = aiResponse.text.trim();
            if (jsonText.includes('```json')) {
                jsonText = jsonText.split('```json')[1].split('```')[0].trim();
            }
            else if (jsonText.includes('```')) {
                jsonText = jsonText.split('```')[1].split('```')[0].trim();
            }
            const parsed = JSON.parse(jsonText);
            analysis = {
                summary: parsed.summary || 'Analiz tamamlandı',
                suggestedFix: parsed.suggestedFix || 'Manuel inceleme önerilir',
                confidence: Math.min(1.0, Math.max(0.0, parsed.confidence || 0.7))
            };
        }
        catch (parseError) {
            // JSON parse başarısız olursa, AI yanıtını direkt kullan
            logger.warn('AI yanıtı JSON formatında değil, fallback kullanılıyor', { error: parseError });
            analysis = {
                summary: `Hata tipi: ${type}, Önem: ${severity}. ${message.substring(0, 100)}`,
                suggestedFix: aiResponse.text || 'Manuel inceleme önerilir',
                confidence: 0.6
            };
        }
        logger.info('Error analyzed successfully', {
            errorId: errorData.id || errorData.errorId,
            provider,
            confidence: analysis.confidence
        });
        logger.end();
        return analysis;
    }
    catch (error) {
        logger.error('Failed to analyze error', error);
        logger.end();
        // Hata durumunda fallback response
        return {
            summary: `Hata analizi başarısız: ${error.message || 'Bilinmeyen hata'}`,
            suggestedFix: 'Lütfen hatayı manuel olarak inceleyin veya tekrar deneyin.',
            confidence: 0.0
        };
    }
}
/**
 * Toplu hata analizi - Teklifbul Rule v1.0 - Paralel işleme ile hızlı analiz
 */
export async function analyzeErrorsBatch(errorIds, db, userId) {
    logger.group('ai-error-analysis:batch');
    try {
        // Tüm hataları önce Firestore'dan al
        const errorDocs = await Promise.all(errorIds.map(async (errorId) => {
            try {
                const doc = await db.collection('error_logs').doc(errorId).get();
                return doc.exists ? { id: errorId, data: doc.data() } : null;
            }
            catch (err) {
                logger.warn('Failed to fetch error doc', { errorId, error: err });
                return null;
            }
        }));
        const validErrors = errorDocs.filter((e) => e !== null);
        if (validErrors.length === 0) {
            logger.warn('No valid errors found for batch analysis');
            logger.end();
            return [];
        }
        // Paralel analiz (rate limit'i aşmamak için batch'ler halinde)
        const BATCH_SIZE = 5; // Aynı anda maksimum 5 hata analiz et
        const results = [];
        for (let i = 0; i < validErrors.length; i += BATCH_SIZE) {
            const batch = validErrors.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(batch.map(async ({ id, data }) => {
                try {
                    const analysis = await analyzeError({ ...data, id }, userId);
                    return { errorId: id, analysis };
                }
                catch (err) {
                    logger.warn('Failed to analyze error in batch', { errorId: id, error: err });
                    return {
                        errorId: id,
                        analysis: {
                            summary: 'Analiz başarısız',
                            suggestedFix: 'Lütfen manuel olarak inceleyin',
                            confidence: 0.0
                        }
                    };
                }
            }));
            // Başarılı sonuçları ekle
            batchResults.forEach((result) => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                }
            });
            // Rate limit için kısa bekleme (batch'ler arası)
            if (i + BATCH_SIZE < validErrors.length) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 500ms bekleme
            }
        }
        logger.info('Batch analysis completed', {
            total: errorIds.length,
            analyzed: results.length,
            failed: errorIds.length - results.length
        });
        logger.end();
        return results;
    }
    catch (error) {
        logger.error('Failed to analyze errors batch', error);
        logger.end();
        throw error;
    }
}
