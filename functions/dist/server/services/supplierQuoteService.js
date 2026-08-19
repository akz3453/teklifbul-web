// Teklifbul Rule v1.0 - Supplier Quote Service
// Manages tokens and supplier quotes for the quote request system
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { randomUUID } from 'crypto';
const QUOTE_TOKENS_COLLECTION = 'supplier_quote_tokens';
const QUOTES_COLLECTION = 'supplier_quotes';
const REQUESTS_COLLECTION = 'purchase_requests';
// Token expiry in days
const TOKEN_EXPIRY_DAYS = 14;
/**
 * Generate a unique quote token for a supplier
 */
export async function generateQuoteToken(requestId, supplierEmail, companyId, userId) {
    try {
        const db = await getAdminDb();
        if (!db) {
            logger.error('Database not available for token generation');
            return null;
        }
        const token = randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        const tokenDoc = {
            token,
            requestId,
            supplierEmail: supplierEmail.toLowerCase().trim(),
            companyId,
            userId,
            createdAt: now,
            expiresAt,
            used: false,
            usedAt: null
        };
        const docRef = await db.collection(QUOTE_TOKENS_COLLECTION).add(tokenDoc);
        logger.info('Quote token generated', {
            tokenId: docRef.id,
            requestId,
            supplierEmail: supplierEmail.substring(0, 5) + '***'
        });
        return { token, expiresAt };
    }
    catch (error) {
        logger.error('Failed to generate quote token', { requestId, error });
        return null;
    }
}
/**
 * Validate a quote token
 */
export async function validateToken(token) {
    try {
        const db = await getAdminDb();
        if (!db) {
            return { valid: false, reason: 'Veritabanı bağlantısı yok' };
        }
        const snapshot = await db.collection(QUOTE_TOKENS_COLLECTION)
            .where('token', '==', token)
            .limit(1)
            .get();
        if (snapshot.empty) {
            return { valid: false, reason: 'Geçersiz veya bulunamayan token' };
        }
        const doc = snapshot.docs[0];
        const data = doc.data();
        const tokenData = {
            id: doc.id,
            token: data.token,
            requestId: data.requestId,
            supplierEmail: data.supplierEmail,
            companyId: data.companyId,
            userId: data.userId,
            createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
            expiresAt: data.expiresAt?.toDate?.() || new Date(data.expiresAt),
            used: data.used,
            usedAt: data.usedAt?.toDate?.() || null
        };
        // Check if expired
        if (new Date() > tokenData.expiresAt) {
            return { valid: false, reason: 'Token süresi dolmuş' };
        }
        // Check if already used (optional - can allow multiple submissions)
        // if (tokenData.used) {
        //   return { valid: false, reason: 'Bu token zaten kullanılmış' };
        // }
        return { valid: true, tokenData };
    }
    catch (error) {
        logger.error('Token validation failed', { error });
        return { valid: false, reason: 'Token doğrulama hatası' };
    }
}
/**
 * Get request details by token (for public quote form)
 */
export async function getRequestByToken(token) {
    try {
        // First validate the token
        const validation = await validateToken(token);
        if (!validation.valid || !validation.tokenData) {
            return { success: false, error: validation.reason };
        }
        const db = await getAdminDb();
        if (!db) {
            return { success: false, error: 'Veritabanı bağlantısı yok' };
        }
        // Get the request
        const requestDoc = await db.collection(REQUESTS_COLLECTION)
            .doc(validation.tokenData.requestId)
            .get();
        if (!requestDoc.exists) {
            return { success: false, error: 'Talep bulunamadı' };
        }
        const requestData = requestDoc.data();
        // Get company name
        let companyName = 'Bilinmiyor';
        try {
            const companyDoc = await db.collection('companies')
                .doc(validation.tokenData.companyId)
                .get();
            if (companyDoc.exists) {
                companyName = companyDoc.data()?.name || companyDoc.data()?.companyName || companyName;
            }
        }
        catch (e) {
            logger.warn('Could not fetch company name', { companyId: validation.tokenData.companyId });
        }
        const request = {
            id: requestDoc.id,
            title: requestData?.title || 'Başlıksız Talep',
            requestNumber: requestData?.requestNumber || requestDoc.id.substring(0, 8).toUpperCase(),
            type: requestData?.type || 'IMTF',
            requesterName: requestData?.requesterName || 'Belirtilmemiş',
            location: requestData?.location || '',
            deliveryAddress: requestData?.deliveryAddress || '',
            includesShipping: requestData?.includesShipping || false,
            note: requestData?.note || '',
            items: (requestData?.items || []).map((item, index) => ({
                no: item.no || index + 1,
                sku: item.sku || '',
                name: item.name || item.productName || '',
                brand: item.brand || item.model || '',
                quantity: item.quantity || 0,
                unit: item.unit || 'Adet'
            })),
            companyName,
            createdAt: requestData?.createdAt?.toDate?.() || new Date()
        };
        return { success: true, request, tokenData: validation.tokenData };
    }
    catch (error) {
        logger.error('Failed to get request by token', { error });
        return { success: false, error: 'Talep bilgileri alınamadı' };
    }
}
/**
 * Submit a supplier quote
 */
export async function submitQuote(token, supplier, items, summary, notes, attachmentUrl) {
    try {
        // Validate token first
        const validation = await validateToken(token);
        if (!validation.valid || !validation.tokenData) {
            return { success: false, error: validation.reason };
        }
        const db = await getAdminDb();
        if (!db) {
            return { success: false, error: 'Veritabanı bağlantısı yok' };
        }
        const tokenData = validation.tokenData;
        // Create the quote
        const quote = {
            tokenId: tokenData.id,
            requestId: tokenData.requestId,
            companyId: tokenData.companyId,
            supplier: {
                email: supplier.email.toLowerCase().trim(),
                companyName: supplier.companyName.trim(),
                contactName: supplier.contactName.trim(),
                phone: supplier.phone.trim()
            },
            items,
            summary,
            notes: notes.trim(),
            attachmentUrl: attachmentUrl || null,
            status: 'pending',
            submittedAt: new Date(),
            viewedAt: null
        };
        const quoteRef = await db.collection(QUOTES_COLLECTION).add(quote);
        // Mark token as used
        await db.collection(QUOTE_TOKENS_COLLECTION).doc(tokenData.id).update({
            used: true,
            usedAt: new Date()
        });
        logger.info('Supplier quote submitted', {
            quoteId: quoteRef.id,
            requestId: tokenData.requestId,
            supplierEmail: supplier.email.substring(0, 5) + '***'
        });
        // TODO: Send notification to the user who created the request
        return { success: true, quoteId: quoteRef.id };
    }
    catch (error) {
        logger.error('Failed to submit quote', { error });
        return { success: false, error: 'Teklif gönderilemedi' };
    }
}
/**
 * Get all quotes for a request (for authenticated users)
 */
export async function getQuotesForRequest(requestId, companyId) {
    try {
        const db = await getAdminDb();
        if (!db) {
            return { success: false, error: 'Veritabanı bağlantısı yok' };
        }
        const snapshot = await db.collection(QUOTES_COLLECTION)
            .where('requestId', '==', requestId)
            .where('companyId', '==', companyId)
            .orderBy('submittedAt', 'desc')
            .get();
        const quotes = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                tokenId: data.tokenId,
                requestId: data.requestId,
                companyId: data.companyId,
                supplier: data.supplier,
                items: data.items,
                summary: data.summary,
                notes: data.notes,
                attachmentUrl: data.attachmentUrl,
                status: data.status,
                submittedAt: data.submittedAt?.toDate?.() || new Date(),
                viewedAt: data.viewedAt?.toDate?.() || null
            };
        });
        return { success: true, quotes };
    }
    catch (error) {
        logger.error('Failed to get quotes for request', { requestId, error });
        return { success: false, error: 'Teklifler alınamadı' };
    }
}
/**
 * Update quote status
 */
export async function updateQuoteStatus(quoteId, companyId, status) {
    try {
        const db = await getAdminDb();
        if (!db) {
            return { success: false, error: 'Veritabanı bağlantısı yok' };
        }
        const quoteRef = db.collection(QUOTES_COLLECTION).doc(quoteId);
        const quoteDoc = await quoteRef.get();
        if (!quoteDoc.exists) {
            return { success: false, error: 'Teklif bulunamadı' };
        }
        if (quoteDoc.data()?.companyId !== companyId) {
            return { success: false, error: 'Bu teklifi görüntüleme yetkiniz yok' };
        }
        const updateData = { status };
        if (status === 'viewed' && !quoteDoc.data()?.viewedAt) {
            updateData.viewedAt = new Date();
        }
        await quoteRef.update(updateData);
        logger.info('Quote status updated', { quoteId, status });
        return { success: true };
    }
    catch (error) {
        logger.error('Failed to update quote status', { quoteId, error });
        return { success: false, error: 'Teklif durumu güncellenemedi' };
    }
}
/**
 * Get tokens sent for a request (for tracking)
 */
export async function getTokensForRequest(requestId, companyId) {
    try {
        const db = await getAdminDb();
        if (!db) {
            return { success: false, error: 'Veritabanı bağlantısı yok' };
        }
        const snapshot = await db.collection(QUOTE_TOKENS_COLLECTION)
            .where('requestId', '==', requestId)
            .where('companyId', '==', companyId)
            .orderBy('createdAt', 'desc')
            .get();
        const tokens = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                token: data.token,
                requestId: data.requestId,
                supplierEmail: data.supplierEmail,
                companyId: data.companyId,
                userId: data.userId,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                expiresAt: data.expiresAt?.toDate?.() || new Date(),
                used: data.used,
                usedAt: data.usedAt?.toDate?.() || null
            };
        });
        return { success: true, tokens };
    }
    catch (error) {
        logger.error('Failed to get tokens for request', { requestId, error });
        return { success: false, error: 'Token listesi alınamadı' };
    }
}
export default {
    generateQuoteToken,
    validateToken,
    getRequestByToken,
    submitQuote,
    getQuotesForRequest,
    updateQuoteStatus,
    getTokensForRequest
};
