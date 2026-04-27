// Teklifbul Rule v1.0 - Supplier Quotes API Routes
// Handles both public (token-based) and authenticated endpoints

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../../src/shared/log/logger.js';
import { verifyToken, AuthenticatedRequest } from '../middleware/auth.js';
import {
    checkEmailQuota,
    incrementEmailUsage,
    getEmailQuotaStatus,
    sendSupplierQuoteEmail,
    getProviderHealth
} from '../services/emailService.js';
import {
    generateQuoteToken,
    validateToken,
    getRequestByToken,
    submitQuote,
    getQuotesForRequest,
    updateQuoteStatus,
    getTokensForRequest
} from '../services/supplierQuoteService.js';
import { getAdminDb } from '../utils/firestore.js';

const router = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const sendEmailSchema = z.object({
    requestId: z.string().min(1),
    supplierEmail: z.string().email()
});

const submitQuoteSchema = z.object({
    supplier: z.object({
        email: z.string().email(),
        companyName: z.string().min(1).max(200),
        contactName: z.string().min(1).max(100),
        phone: z.string().min(5).max(20)
    }),
    items: z.array(z.object({
        productName: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().min(1),
        unitPrice: z.number().min(0),
        totalPrice: z.number().min(0),
        note: z.string().optional()
    })).min(1),
    summary: z.object({
        totalPrice: z.number().min(0),
        currency: z.string().default('TRY'),
        validDays: z.number().int().min(1).max(365).default(15),
        deliveryDays: z.number().int().min(0).max(365).default(7),
        includesShipping: z.boolean().default(false)
    }),
    notes: z.string().max(2000).default(''),
    attachmentUrl: z.string().optional()
});

// ============================================
// HELPER: Get user ID and company ID from request
// ============================================
function getAuthInfo(req: AuthenticatedRequest): { userId: string | null; companyId: string | null } {
    const user = req.user;
    if (!user) return { userId: null, companyId: null };

    return {
        userId: user.uid || null,
        companyId: user.activeCompanyId || null
    };
}

// ============================================
// PUBLIC ENDPOINTS (No Auth Required)
// ============================================

/**
 * POST /api/supplier-quotes/validate-token
 * Validate a quote token
 */
router.post('/validate-token', async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.body as { token?: string };

        if (!token || typeof token !== 'string') {
            res.status(400).json({ success: false, error: 'Token gerekli' });
            return;
        }

        const result = await validateToken(token);

        if (!result.valid) {
            res.status(400).json({ success: false, error: result.reason });
            return;
        }

        res.json({
            success: true,
            expiresAt: result.tokenData?.expiresAt
        });
    } catch (error) {
        logger.error('Token validation error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

/**
 * GET /api/supplier-quotes/request/:token
 * Get request details by token (for public quote form)
 */
router.get('/request/:token', async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.params.token;

        if (!token) {
            res.status(400).json({ success: false, error: 'Token gerekli' });
            return;
        }

        const result = await getRequestByToken(token);

        if (!result.success) {
            res.status(400).json({ success: false, error: result.error });
            return;
        }

        res.json({
            success: true,
            request: result.request,
            expiresAt: result.tokenData?.expiresAt
        });
    } catch (error) {
        logger.error('Get request by token error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

/**
 * POST /api/supplier-quotes/submit/:token
 * Submit a quote (public, token-based)
 */
router.post('/submit/:token', async (req: Request, res: Response): Promise<void> => {
    try {
        const token = req.params.token;

        if (!token) {
            res.status(400).json({ success: false, error: 'Token gerekli' });
            return;
        }

        // Validate request body
        const parseResult = submitQuoteSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({
                success: false,
                error: 'Geçersiz form verisi',
                details: parseResult.error.errors
            });
            return;
        }

        const { supplier, items, summary, notes, attachmentUrl } = parseResult.data;

        // Submit the quote
        const result = await submitQuote(
            token,
            supplier,
            items,
            summary,
            notes,
            attachmentUrl
        );

        if (!result.success) {
            res.status(400).json({ success: false, error: result.error });
            return;
        }

        res.json({
            success: true,
            quoteId: result.quoteId,
            message: 'Teklifiniz başarıyla gönderildi. Teşekkür ederiz!'
        });
    } catch (error) {
        logger.error('Submit quote error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

// ============================================
// AUTHENTICATED ENDPOINTS
// ============================================

/**
 * POST /api/supplier-quotes/send-email
 * Send quote request email to supplier
 */
router.post('/send-email', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { userId, companyId } = getAuthInfo(req);

        if (!userId || !companyId) {
            res.status(400).json({ success: false, error: 'Kullanıcı veya firma bilgisi bulunamadı' });
            return;
        }

        // Validate request body
        const parseResult = sendEmailSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({
                success: false,
                error: 'Geçersiz istek verisi',
                details: parseResult.error.errors
            });
            return;
        }

        const { requestId, supplierEmail } = parseResult.data;

        // Check email quota
        const quotaCheck = await checkEmailQuota(userId, companyId);
        if (!quotaCheck.allowed) {
            res.status(429).json({ success: false, error: quotaCheck.reason });
            return;
        }

        // Get request details
        const db = await getAdminDb();
        if (!db) {
            res.status(500).json({ success: false, error: 'Veritabanı bağlantısı yok' });
            return;
        }

        const requestDoc = await db.collection('purchase_requests').doc(requestId).get();
        if (!requestDoc.exists) {
            res.status(404).json({ success: false, error: 'Talep bulunamadı' });
            return;
        }

        const requestData = requestDoc.data();

        // Verify the request belongs to this company
        if (requestData?.companyId !== companyId) {
            res.status(403).json({ success: false, error: 'Bu talebe erişim yetkiniz yok' });
            return;
        }

        // Get company name
        let companyName = 'Firma';
        try {
            const companyDoc = await db.collection('companies').doc(companyId).get();
            if (companyDoc.exists) {
                companyName = companyDoc.data()?.name || companyDoc.data()?.companyName || companyName;
            }
        } catch (e) {
            logger.warn('Could not fetch company name', { companyId });
        }

        // Generate token
        const tokenResult = await generateQuoteToken(requestId, supplierEmail, companyId, userId);
        if (!tokenResult) {
            res.status(500).json({ success: false, error: 'Token oluşturulamadı' });
            return;
        }

        // Build quote form URL
        const appUrl = process.env.APP_URL || 'https://teklifbul.com';
        const quoteFormUrl = `${appUrl}/pages/supplier-quote.html?token=${tokenResult.token}`;

        // Calculate expiry days
        const expiryDays = Math.ceil((tokenResult.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        // Send email
        const emailResult = await sendSupplierQuoteEmail({
            requestId,
            requestTitle: requestData?.title || 'Satın Alma Talebi',
            requestNumber: requestData?.requestNumber || requestId.substring(0, 8).toUpperCase(),
            requesterName: requestData?.requesterName || 'Yetkili',
            companyName,
            deliveryLocation: requestData?.deliveryAddress || requestData?.location || 'Belirtilmemiş',
            supplierEmail,
            quoteFormUrl,
            expiryDays
        });

        if (!emailResult.success) {
            res.status(500).json({ success: false, error: emailResult.error });
            return;
        }

        // Increment email usage (include provider info)
        await incrementEmailUsage(userId, companyId, emailResult.provider || 'unknown');

        logger.info('Supplier quote email sent', {
            requestId,
            supplierEmail: supplierEmail.substring(0, 5) + '***',
            messageId: emailResult.messageId
        });

        res.json({
            success: true,
            message: 'E-posta başarıyla gönderildi',
            expiresAt: tokenResult.expiresAt
        });
    } catch (error) {
        logger.error('Send email error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

/**
 * GET /api/supplier-quotes/quota
 * Get current email quota status
 */
router.get('/quota', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { userId, companyId } = getAuthInfo(req);

        if (!userId || !companyId) {
            res.status(400).json({ success: false, error: 'Kullanıcı veya firma bilgisi bulunamadı' });
            return;
        }

        const quotaStatus = await getEmailQuotaStatus(userId, companyId);

        res.json({ success: true, quota: quotaStatus });
    } catch (error) {
        logger.error('Get quota error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

/**
 * GET /api/supplier-quotes/list/:requestId
 * Get all quotes for a request
 */
router.get('/list/:requestId', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { companyId } = getAuthInfo(req);
        const requestId = req.params.requestId;

        if (!companyId) {
            res.status(400).json({ success: false, error: 'Firma bilgisi bulunamadı' });
            return;
        }

        const result = await getQuotesForRequest(requestId, companyId);

        if (!result.success) {
            res.status(400).json({ success: false, error: result.error });
            return;
        }

        res.json({ success: true, quotes: result.quotes });
    } catch (error) {
        logger.error('Get quotes error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

/**
 * GET /api/supplier-quotes/tokens/:requestId
 * Get all tokens sent for a request (for tracking)
 */
router.get('/tokens/:requestId', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { companyId } = getAuthInfo(req);
        const requestId = req.params.requestId;

        if (!companyId) {
            res.status(400).json({ success: false, error: 'Firma bilgisi bulunamadı' });
            return;
        }

        const result = await getTokensForRequest(requestId, companyId);

        if (!result.success) {
            res.status(400).json({ success: false, error: result.error });
            return;
        }

        // Mask email addresses for privacy
        const maskedTokens = result.tokens?.map(t => ({
            ...t,
            supplierEmail: t.supplierEmail.substring(0, 3) + '***@' + t.supplierEmail.split('@')[1]
        }));

        res.json({ success: true, tokens: maskedTokens });
    } catch (error) {
        logger.error('Get tokens error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

/**
 * PATCH /api/supplier-quotes/:quoteId/status
 * Update quote status (viewed/accepted/rejected)
 */
router.patch('/:quoteId/status', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const { companyId } = getAuthInfo(req);
        const quoteId = req.params.quoteId;
        const { status } = req.body as { status?: string };

        if (!companyId) {
            res.status(400).json({ success: false, error: 'Firma bilgisi bulunamadı' });
            return;
        }

        if (!status || !['viewed', 'accepted', 'rejected'].includes(status)) {
            res.status(400).json({ success: false, error: 'Geçersiz durum' });
            return;
        }

        const result = await updateQuoteStatus(quoteId, companyId, status as 'viewed' | 'accepted' | 'rejected');

        if (!result.success) {
            res.status(400).json({ success: false, error: result.error });
            return;
        }

        res.json({ success: true, message: 'Durum güncellendi' });
    } catch (error) {
        logger.error('Update status error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

/**
 * GET /api/supplier-quotes/health (Admin only)
 * Get email provider health status
 */
router.get('/health', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // Check if user is admin
        const user = req.user;
        if (!user?.isAdmin && user?.role !== 'admin' && user?.role !== 'ops') {
            res.status(403).json({ success: false, error: 'Admin yetkisi gerekli' });
            return;
        }

        const health = getProviderHealth();
        res.json({ success: true, ...health });
    } catch (error) {
        logger.error('Get provider health error', { error });
        res.status(500).json({ success: false, error: 'Sunucu hatası' });
    }
});

export default router;
