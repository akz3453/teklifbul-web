/**
 * Purchase Assistant AI Service
 * Teklifbul Rule v1.0 - AI-powered purchase assistance
 *
 * Talep yazdırma, teklif analizi, otomatik form doldurma ve hata yakalama servisleri
 */
import { sendChat } from './index.js';
import { logger } from '../../src/shared/log/logger.js';
import { getUserAIProvider } from '../services/userService.js';
// Default provider - env'den al veya OpenAI fallback
function getDefaultProvider() {
    const envProvider = process.env.AI_DEFAULT_PROVIDER?.toLowerCase();
    if (envProvider === 'gemini' || envProvider === 'openai') {
        return envProvider;
    }
    return 'openai'; // Default fallback
}
export async function generatePurchaseRequestText(input, userId, opts) {
    logger.group('AI: Generate Purchase Request Text');
    try {
        const language = input.language || 'tr';
        const provider = opts?.provider || (userId ? await getUserAIProvider(userId) : getDefaultProvider());
        const model = opts?.model || 'gpt-4o-mini';
        const systemPrompt = language === 'tr'
            ? `Sen Nefisoft satın alma asistanısın. Kullanıcıya profesyonel, kurumsal ve net bir satın alma talebi metni oluştur. 
Metin Türkçe olmalı, sakin ve profesyonel bir üslup kullan. 
ÖNEMLİ: Bu sadece bir asistan önerisidir, nihai karar kullanıcıya aittir.`
            : `You are Nefisoft's purchase assistant. Create a professional, corporate, and clear purchase request text for the user.
The text should be in English, using a calm and professional tone.
IMPORTANT: This is only an assistant suggestion, the final decision belongs to the user.`;
        const finalSystemPrompt = opts?.customInstructions
            ? `${systemPrompt}\n\nKULLANICI ÖZEL TALİMATLARI:\n${opts.customInstructions}`
            : systemPrompt;
        const itemsText = input.items.map((item, idx) => {
            let itemDesc = `${idx + 1}. ${item.name}`;
            if (item.quantity)
                itemDesc += ` - Miktar: ${item.quantity}`;
            if (item.unit)
                itemDesc += ` ${item.unit}`;
            if (item.technicalSpec)
                itemDesc += ` - Teknik Şart: ${item.technicalSpec}`;
            return itemDesc;
        }).join('\n');
        const userPrompt = language === 'tr'
            ? `Aşağıdaki bilgilere göre profesyonel bir satın alma talebi metni oluştur:

${input.companyName ? `Firma: ${input.companyName}` : ''}
${input.requesterName ? `Talep Eden: ${input.requesterName}` : ''}

Ürünler/Kalemler:
${itemsText}

${input.deliveryLocation ? `Teslimat Yeri: ${input.deliveryLocation}` : ''}
${input.deliveryDate ? `Teslimat Tarihi: ${input.deliveryDate}` : ''}
${input.priority ? `Öncelik: ${input.priority}` : ''}
${input.notes ? `Notlar: ${input.notes}` : ''}

Metni oluştur ve ayrıca 3-5 öneri/uyarı maddesi ekle (suggestions array olarak).`
            : `Create a professional purchase request text based on the following information:

${input.companyName ? `Company: ${input.companyName}` : ''}
${input.requesterName ? `Requester: ${input.requesterName}` : ''}

Items:
${itemsText}

${input.deliveryLocation ? `Delivery Location: ${input.deliveryLocation}` : ''}
${input.deliveryDate ? `Delivery Date: ${input.deliveryDate}` : ''}
${input.priority ? `Priority: ${input.priority}` : ''}
${input.notes ? `Notes: ${input.notes}` : ''}

Create the text and also add 3-5 suggestion/warning items (as a suggestions array).`;
        const messages = [
            { role: 'user', content: userPrompt }
        ];
        const result = await sendChat(messages, {
            provider,
            systemPrompt: finalSystemPrompt,
            model,
            temperature: 0.3,
            maxTokens: 2000
        });
        // Parse response - AI'dan gelen metni ve önerileri ayır
        const text = result.text;
        const suggestions = [];
        // Basit parsing - "Öneriler:" veya "Suggestions:" sonrasını al
        const suggestionsMatch = text.match(/(?:Öneriler|Suggestions):\s*(.+?)(?:\n\n|$)/is);
        if (suggestionsMatch) {
            const suggestionsText = suggestionsMatch[1];
            suggestionsText.split(/\n/).forEach(line => {
                const cleaned = line.trim().replace(/^[-•*]\s*/, '');
                if (cleaned)
                    suggestions.push(cleaned);
            });
        }
        // Eğer suggestions bulunamadıysa, metinden çıkar
        if (suggestions.length === 0) {
            // Metni paragraflara böl ve son 3-5 paragrafı öneri olarak al
            const paragraphs = text.split(/\n\n/).filter(p => p.trim());
            if (paragraphs.length > 3) {
                suggestions.push(...paragraphs.slice(-3).map(p => p.trim()));
            }
        }
        logger.info('Purchase request text generated', {
            textLength: text.length,
            suggestionsCount: suggestions.length,
            totalTokens: result.totalTokens,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens
        });
        logger.end();
        return {
            text,
            suggestions: suggestions.slice(0, 5),
            tokenUsage: {
                totalTokens: result.totalTokens,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens
            }
        };
    }
    catch (error) {
        logger.error('Error generating purchase request text', error);
        logger.end();
        throw new Error(error?.message || 'Satın alma talebi metni oluşturulurken hata oluştu.');
    }
}
export async function analyzeOfferComparison(input, userId, opts) {
    logger.group('AI: Analyze Offer Comparison');
    try {
        const language = input.language || 'tr';
        const provider = opts?.provider || (userId ? await getUserAIProvider(userId) : getDefaultProvider());
        const model = opts?.model || 'gpt-4o-mini';
        const systemPrompt = language === 'tr'
            ? `Sen Nefisoft teklif analiz asistanısın. Birden fazla tedarikçinin tekliflerini analiz edip özet, sıralama ve öneriler sun.
Analiz objektif, kurumsal ve net olmalı. ÖNEMLİ: Bu sadece bir asistan önerisidir, nihai karar kullanıcıya aittir.`
            : `You are Nefisoft's offer analysis assistant. Analyze multiple supplier offers and provide summary, ranking, and recommendations.
Analysis should be objective, corporate, and clear. IMPORTANT: This is only an assistant suggestion, the final decision belongs to the user.`;
        const finalSystemPrompt = opts?.customInstructions
            ? `${systemPrompt}\n\nKULLANICI ÖZEL TALİMATLARI:\n${opts.customInstructions}`
            : systemPrompt;
        const itemsText = input.items.map((item, idx) => {
            const offersText = item.offers.map(offer => {
                let offerDesc = `- ${offer.supplierName}: ${offer.price} ${offer.currency || 'TRY'}`;
                if (offer.leadTimeDays)
                    offerDesc += `, Teslim: ${offer.leadTimeDays} gün`;
                if (offer.warrantyMonths)
                    offerDesc += `, Garanti: ${offer.warrantyMonths} ay`;
                if (offer.paymentTerms)
                    offerDesc += `, Ödeme: ${offer.paymentTerms}`;
                if (offer.qualityNotes)
                    offerDesc += `, Not: ${offer.qualityNotes}`;
                return offerDesc;
            }).join('\n');
            return `${idx + 1}. ${item.name}:\n${offersText}`;
        }).join('\n\n');
        const criteriaText = input.decisionCriteria?.join(', ') || 'fiyat, hız, kalite';
        const userPrompt = language === 'tr'
            ? `Aşağıdaki teklifleri analiz et ve JSON formatında şu bilgileri döndür:
- summary: Kısa özet (2-3 cümle)
- rankedSuppliers: Tedarikçileri skorlarına göre sırala (her biri için supplierName, score: 0-100, reason)
- risks: Riskler listesi
- recommendations: Öneriler listesi

Ürünler ve Teklifler:
${itemsText}

Karar Kriterleri: ${criteriaText}

JSON formatında döndür.`
            : `Analyze the following offers and return in JSON format:
- summary: Short summary (2-3 sentences)
- rankedSuppliers: Rank suppliers by score (each with supplierName, score: 0-100, reason)
- risks: List of risks
- recommendations: List of recommendations

Items and Offers:
${itemsText}

Decision Criteria: ${criteriaText}

Return in JSON format.`;
        const messages = [
            { role: 'user', content: userPrompt }
        ];
        const result = await sendChat(messages, {
            provider,
            systemPrompt: finalSystemPrompt,
            model,
            temperature: 0.2,
            maxTokens: 2000
        });
        // Parse JSON response
        let parsed;
        try {
            // JSON'u metinden çıkar
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
            else {
                throw new Error('JSON not found in response');
            }
        }
        catch (parseError) {
            // Fallback: Basit parsing
            parsed = {
                summary: result.text.split('\n')[0] || 'Analiz tamamlandı.',
                rankedSuppliers: [],
                risks: [],
                recommendations: []
            };
        }
        logger.info('Offer comparison analyzed', {
            suppliersCount: parsed.rankedSuppliers.length
        });
        logger.end();
        return parsed;
    }
    catch (error) {
        logger.error('Error analyzing offer comparison', error);
        logger.end();
        throw new Error(error?.message || 'Teklif analizi sırasında hata oluştu.');
    }
}
export async function autofillRequestFields(input, userId, opts) {
    logger.group('AI: Autofill Request Fields');
    try {
        const language = input.language || 'tr';
        const provider = opts?.provider || (userId ? await getUserAIProvider(userId) : getDefaultProvider());
        const model = opts?.model || 'gpt-4o-mini';
        const systemPrompt = language === 'tr'
            ? `Sen Nefisoft form doldurma asistanısın. Kullanıcının ham metnini normalize edip form alanlarına böl.
ÖNEMLİ: Bu sadece bir asistan önerisidir, nihai karar kullanıcıya aittir.`
            : `You are Nefisoft's form filling assistant. Normalize user's raw text and split into form fields.
IMPORTANT: This is only an assistant suggestion, the final decision belongs to the user.`;
        const materialsText = input.knownMaterials?.map(m => `${m.code}: ${m.name} (${m.defaultUnit || 'adet'})`).join('\n') || '';
        const userPrompt = language === 'tr'
            ? `Aşağıdaki ham metni normalize et ve JSON formatında döndür:
- normalizedItems: Array<{ name, unit?, technicalSpec?, suggestions? }>
- missingFields: Eksik alanlar listesi

Ham Metin: ${input.rawText || ''}

${materialsText ? `Bilinen Malzemeler:\n${materialsText}` : ''}

JSON formatında döndür.`
            : `Normalize the following raw text and return in JSON format:
- normalizedItems: Array<{ name, unit?, technicalSpec?, suggestions? }>
- missingFields: List of missing fields

Raw Text: ${input.rawText || ''}

${materialsText ? `Known Materials:\n${materialsText}` : ''}

Return in JSON format.`;
        const messages = [
            { role: 'user', content: userPrompt }
        ];
        const result = await sendChat(messages, {
            provider,
            systemPrompt,
            model,
            temperature: 0.2,
            maxTokens: 1500
        });
        // Parse JSON response
        let parsed;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
            else {
                throw new Error('JSON not found in response');
            }
        }
        catch (parseError) {
            // Fallback
            parsed = {
                normalizedItems: [],
                missingFields: []
            };
        }
        logger.info('Request fields autofilled', {
            itemsCount: parsed.normalizedItems.length
        });
        logger.end();
        return parsed;
    }
    catch (error) {
        logger.error('Error autofilling request fields', error);
        logger.end();
        throw new Error(error?.message || 'Form doldurma sırasında hata oluştu.');
    }
}
export async function validateRequestForErrors(input, userId, opts) {
    logger.group('AI: Validate Request For Errors');
    try {
        const language = input.language || 'tr';
        const provider = opts?.provider || (userId ? await getUserAIProvider(userId) : getDefaultProvider());
        const model = opts?.model || 'gpt-4o-mini';
        const systemPrompt = language === 'tr'
            ? `Sen Nefisoft doğrulama asistanısın. Talep verilerini kontrol et ve hatalar, uyarılar ve öneriler sun.
ÖNEMLİ: Bu sadece bir asistan önerisidir, nihai karar kullanıcıya aittir.`
            : `You are Nefisoft's validation assistant. Check request data and provide errors, warnings, and suggestions.
IMPORTANT: This is only an assistant suggestion, the final decision belongs to the user.`;
        const itemsText = input.items.map((item, idx) => {
            let itemDesc = `${idx + 1}. ${item.name}`;
            if (item.quantity)
                itemDesc += ` - Miktar: ${item.quantity}`;
            if (item.unit)
                itemDesc += ` ${item.unit}`;
            if (item.technicalSpec)
                itemDesc += ` - Şart: ${item.technicalSpec}`;
            return itemDesc;
        }).join('\n');
        const userPrompt = language === 'tr'
            ? `Aşağıdaki talep verilerini kontrol et ve JSON formatında döndür:
- isValid: boolean (kritik hata yoksa true)
- errors: Kritik hatalar listesi (eksik zorunlu alan, mantık hatası vb.)
- warnings: Uyarılar listesi (şüpheli değer, çelişki vb.)
- suggestions: Öneriler listesi

Veriler:
${itemsText}

${input.deliveryDate ? `Teslimat Tarihi: ${input.deliveryDate}` : ''}
${input.budgetLimit ? `Bütçe: ${input.budgetLimit} ${input.currency || 'TRY'}` : ''}

JSON formatında döndür.`
            : `Check the following request data and return in JSON format:
- isValid: boolean (true if no critical errors)
- errors: List of critical errors (missing required fields, logic errors, etc.)
- warnings: List of warnings (suspicious values, contradictions, etc.)
- suggestions: List of suggestions

Data:
${itemsText}

${input.deliveryDate ? `Delivery Date: ${input.deliveryDate}` : ''}
${input.budgetLimit ? `Budget: ${input.budgetLimit} ${input.currency || 'TRY'}` : ''}

Return in JSON format.`;
        const messages = [
            { role: 'user', content: userPrompt }
        ];
        const result = await sendChat(messages, {
            provider,
            systemPrompt,
            model,
            temperature: 0.1,
            maxTokens: 1500
        });
        // Parse JSON response
        let parsed;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            }
            else {
                throw new Error('JSON not found in response');
            }
        }
        catch (parseError) {
            // Fallback
            parsed = {
                isValid: true,
                errors: [],
                warnings: [],
                suggestions: []
            };
        }
        logger.info('Request validated', {
            isValid: parsed.isValid,
            errorsCount: parsed.errors.length
        });
        logger.end();
        return parsed;
    }
    catch (error) {
        logger.error('Error validating request', error);
        logger.end();
        throw new Error(error?.message || 'Doğrulama sırasında hata oluştu.');
    }
}
