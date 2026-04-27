/**
 * Cash Routes - Kasa Modülü API
 * Teklifbul Rule v1.0 - ETA uyumlu kasa yönetimi
 */

import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { logger } from '../../../src/shared/log/logger.js';
import {
    createCashAccount,
    updateCashAccount,
    getCashAccounts,
    recordCashTransaction,
    getCashTransactions,
    transferBetweenCashAccounts,
    deleteCashAccount,
    getDefaultCashAccount
} from '../services/cashService.js';
import { getAdminDb } from '../../utils/firestore.js';

const router = express.Router();

// Tüm route'lar authentication gerektirir
router.use(verifyToken);

// Validation schemas
const createCashAccountSchema = z.object({
    body: z.object({
        companyId: z.string().min(1),
        code: z.string().optional(),
        name: z.string().min(1, 'Kasa adı zorunludur'),
        currency: z.enum(['TRY', 'USD', 'EUR']).default('TRY'),
        openingBalance: z.number().min(0).optional(),
        isDefault: z.boolean().optional(),
        notes: z.string().optional()
    })
});

const updateCashAccountSchema = z.object({
    params: z.object({
        id: z.string().min(1)
    }),
    body: z.object({
        companyId: z.string().min(1),
        name: z.string().min(1).optional(),
        currency: z.enum(['TRY', 'USD', 'EUR']).optional(),
        isActive: z.boolean().optional(),
        isDefault: z.boolean().optional(),
        notes: z.string().optional()
    })
});

const cashTransactionSchema = z.object({
    params: z.object({
        id: z.string().min(1)
    }),
    body: z.object({
        companyId: z.string().min(1),
        type: z.enum(['in', 'out']),
        transactionType: z.enum([
            'opening_balance', 'customer_receipt', 'supplier_payment',
            'bank_deposit', 'bank_withdrawal', 'cash_transfer_in', 'cash_transfer_out',
            'expense', 'income', 'check_receipt', 'note_receipt',
            'check_payment', 'note_payment', 'adjustment', 'other'
        ]),
        amount: z.number().positive('Tutar sıfırdan büyük olmalı'),
        currency: z.string().optional(),
        exchangeRate: z.number().positive().optional(),
        relatedEntityType: z.enum(['customer', 'supplier', 'bank', 'cash_account', 'expense', 'other']).optional(),
        relatedEntityId: z.string().optional(),
        relatedEntityName: z.string().optional(),
        documentNumber: z.string().optional(),
        description: z.string().min(1, 'Açıklama zorunludur'),
        date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    })
});

const transferSchema = z.object({
    body: z.object({
        companyId: z.string().min(1),
        fromCashAccountId: z.string().min(1),
        toCashAccountId: z.string().min(1),
        amount: z.number().positive('Tutar sıfırdan büyük olmalı'),
        exchangeRate: z.number().positive().optional(),
        description: z.string().optional(),
        date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    })
});

/**
 * GET /api/cash-accounts
 * Kasa listesi
 */
router.get('/',
    requirePermission('cash.view'),
    async (req: any, res) => {
        try {
            const companyId = req.query.companyId as string;

            if (!companyId) {
                return res.status(400).json({ ok: false, error: 'companyId gerekli' });
            }

            const accounts = await getCashAccounts(companyId);

            return res.json({
                ok: true,
                accounts
            });
        } catch (error: any) {
            logger.error('Kasa listesi hatası', error);
            return res.status(500).json({
                ok: false,
                error: error.message || 'Kasa listesi alınamadı'
            });
        }
    }
);

/**
 * GET /api/cash-accounts/default
 * Varsayılan kasa
 */
router.get('/default',
    requirePermission('cash.view'),
    async (req: any, res) => {
        try {
            const companyId = req.query.companyId as string;

            if (!companyId) {
                return res.status(400).json({ ok: false, error: 'companyId gerekli' });
            }

            const account = await getDefaultCashAccount(companyId);

            return res.json({
                ok: true,
                account
            });
        } catch (error: any) {
            logger.error('Varsayılan kasa hatası', error);
            return res.status(500).json({
                ok: false,
                error: error.message || 'Varsayılan kasa alınamadı'
            });
        }
    }
);

/**
 * GET /api/cash-accounts/:id
 * Kasa detayı
 */
router.get('/:id',
    requirePermission('cash.view'),
    async (req: any, res) => {
        try {
            const { id } = req.params;
            const companyId = req.query.companyId as string;

            if (!companyId) {
                return res.status(400).json({ ok: false, error: 'companyId gerekli' });
            }

            const db = await getAdminDb();
            if (!db) {
                return res.status(500).json({ ok: false, error: 'Veritabanı bağlantı hatası' });
            }

            const accountDoc = await db.collection('cash_accounts').doc(id).get();

            if (!accountDoc.exists) {
                return res.status(404).json({ ok: false, error: 'Kasa bulunamadı' });
            }

            const account = accountDoc.data();
            if (account?.companyId !== companyId) {
                return res.status(403).json({ ok: false, error: 'Yetkisiz erişim' });
            }

            return res.json({
                ok: true,
                account
            });
        } catch (error: any) {
            logger.error('Kasa detay hatası', error);
            return res.status(500).json({
                ok: false,
                error: error.message || 'Kasa detayı alınamadı'
            });
        }
    }
);

/**
 * POST /api/cash-accounts
 * Yeni kasa oluştur
 */
router.post('/',
    validate({ body: createCashAccountSchema.shape.body }),
    requirePermission('cash.create'),
    async (req: any, res) => {
        try {
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }

            const body = req.body;

            const cashAccountId = await createCashAccount({
                companyId: body.companyId,
                code: body.code,
                name: body.name,
                currency: body.currency || 'TRY',
                openingBalance: body.openingBalance,
                isDefault: body.isDefault,
                notes: body.notes,
                userId
            });

            return res.status(201).json({
                ok: true,
                cashAccountId,
                message: 'Kasa oluşturuldu'
            });
        } catch (error: any) {
            logger.error('Kasa oluşturma hatası', error);
            return res.status(400).json({
                ok: false,
                error: error.message || 'Kasa oluşturulamadı'
            });
        }
    }
);

/**
 * PUT /api/cash-accounts/:id
 * Kasa güncelle
 */
router.put('/:id',
    validate({ params: updateCashAccountSchema.shape.params, body: updateCashAccountSchema.shape.body }),
    requirePermission('cash.edit'),
    async (req: any, res) => {
        try {
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }

            const { id } = req.params;
            const body = req.body;

            await updateCashAccount({
                cashAccountId: id,
                companyId: body.companyId,
                name: body.name,
                currency: body.currency,
                isActive: body.isActive,
                isDefault: body.isDefault,
                notes: body.notes,
                userId
            });

            return res.json({
                ok: true,
                message: 'Kasa güncellendi'
            });
        } catch (error: any) {
            logger.error('Kasa güncelleme hatası', error);
            return res.status(400).json({
                ok: false,
                error: error.message || 'Kasa güncellenemedi'
            });
        }
    }
);

/**
 * DELETE /api/cash-accounts/:id
 * Kasa sil (soft delete)
 */
router.delete('/:id',
    requirePermission('cash.delete'),
    async (req: any, res) => {
        try {
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }

            const { id } = req.params;
            const companyId = req.query.companyId as string;

            if (!companyId) {
                return res.status(400).json({ ok: false, error: 'companyId gerekli' });
            }

            await deleteCashAccount(id, companyId, userId);

            return res.json({
                ok: true,
                message: 'Kasa silindi'
            });
        } catch (error: any) {
            logger.error('Kasa silme hatası', error);
            return res.status(400).json({
                ok: false,
                error: error.message || 'Kasa silinemedi'
            });
        }
    }
);

/**
 * GET /api/cash-accounts/:id/transactions
 * Kasa hareketleri
 */
router.get('/:id/transactions',
    requirePermission('cash.view'),
    async (req: any, res) => {
        try {
            const { id } = req.params;
            const companyId = req.query.companyId as string;
            const startDate = req.query.startDate as string;
            const endDate = req.query.endDate as string;
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

            if (!companyId) {
                return res.status(400).json({ ok: false, error: 'companyId gerekli' });
            }

            const transactions = await getCashTransactions(companyId, id, {
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                limit
            });

            return res.json({
                ok: true,
                transactions
            });
        } catch (error: any) {
            logger.error('Kasa hareketleri hatası', error);
            return res.status(500).json({
                ok: false,
                error: error.message || 'Kasa hareketleri alınamadı'
            });
        }
    }
);

/**
 * POST /api/cash-accounts/:id/transactions
 * Kasa hareketi ekle
 */
router.post('/:id/transactions',
    validate({ params: cashTransactionSchema.shape.params, body: cashTransactionSchema.shape.body }),
    requirePermission('cash.create'),
    async (req: any, res) => {
        try {
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }

            const { id } = req.params;
            const body = req.body;

            const transactionId = await recordCashTransaction({
                companyId: body.companyId,
                cashAccountId: id,
                type: body.type,
                transactionType: body.transactionType,
                amount: body.amount,
                currency: body.currency,
                exchangeRate: body.exchangeRate,
                relatedEntityType: body.relatedEntityType,
                relatedEntityId: body.relatedEntityId,
                relatedEntityName: body.relatedEntityName,
                documentNumber: body.documentNumber,
                description: body.description,
                date: new Date(body.date),
                userId
            });

            return res.status(201).json({
                ok: true,
                transactionId,
                message: 'Kasa hareketi kaydedildi'
            });
        } catch (error: any) {
            logger.error('Kasa hareketi ekleme hatası', error);
            return res.status(400).json({
                ok: false,
                error: error.message || 'Kasa hareketi eklenemedi'
            });
        }
    }
);

/**
 * POST /api/cash-accounts/transfer
 * Kasalar arası virman
 */
router.post('/transfer',
    validate({ body: transferSchema.shape.body }),
    requirePermission('cash.create'),
    async (req: any, res) => {
        try {
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }

            const body = req.body;

            const result = await transferBetweenCashAccounts({
                companyId: body.companyId,
                fromCashAccountId: body.fromCashAccountId,
                toCashAccountId: body.toCashAccountId,
                amount: body.amount,
                exchangeRate: body.exchangeRate,
                description: body.description,
                date: new Date(body.date),
                userId
            });

            return res.status(201).json({
                ok: true,
                ...result,
                message: 'Virman işlemi tamamlandı'
            });
        } catch (error: any) {
            logger.error('Virman hatası', error);
            return res.status(400).json({
                ok: false,
                error: error.message || 'Virman yapılamadı'
            });
        }
    }
);

export default router;
