/**
 * Manual stock movements API
 * Teklifbul Rule v1.0 — transactional Admin SDK writes
 */
import express from 'express';
import { verifyToken } from '../../middleware/auth.js';
import { requireAnyPermission } from '../../middleware/requirePermission.js';
import { requirePremium } from '../../middleware/requirePremium.js';
import { getCompanyIdFromRequest, hasPermission } from '../services/permissionService.js';
import { recordManualStockMovement } from '../services/stockService.js';
import { logger } from '../../../src/shared/log/logger.js';
import { Errors } from '../errors/errorCatalog.js';
import { respondError } from '../errors/respondError.js';
const router = express.Router();
router.use(verifyToken);
router.use(requirePremium);
const MOVEMENT_PERMS = [
    'stock.movements.in',
    'stock.movements.out',
    'stock.movements.transfer',
    'stock.movements.adjust',
];
const TYPE_PERM = {
    IN: 'stock.movements.in',
    OUT: 'stock.movements.out',
    TRANSFER: 'stock.movements.transfer',
    ADJUST: 'stock.movements.adjust',
};
/**
 * POST /api/stock-movements
 * Manuel stok hareketi (IN | OUT | TRANSFER | ADJUST)
 */
router.post('/', requireAnyPermission([...MOVEMENT_PERMS]), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return respondError(res, Errors.forbidden('Kimlik doğrulama gerekli'), 401);
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return respondError(res, Errors.forbidden('Şirket bilgisi bulunamadı'));
        }
        const body = req.body || {};
        const type = String(body.type || '').toUpperCase();
        const specificPerm = TYPE_PERM[type];
        if (!specificPerm) {
            return res.status(400).json({ ok: false, error: 'Geçersiz hareket tipi' });
        }
        const allowed = await hasPermission(userId, companyId, specificPerm, req);
        if (!allowed) {
            return respondError(res, Errors.forbidden(`Bu tip stok hareketi için yetkiniz yok: ${specificPerm}`, specificPerm));
        }
        const qty = Number(body.qty);
        const unitCost = body.unitCost != null ? Number(body.unitCost) : 0;
        const extrasRaw = Array.isArray(body.extras) ? body.extras : [];
        const extras = extrasRaw
            .map((e) => ({
            name: String(e?.name || '').slice(0, 80),
            amount: Number(e?.amount) || 0,
        }))
            .filter((e) => e.name);
        let expiryDate = null;
        if (body.expiryDate) {
            const parsed = new Date(body.expiryDate);
            if (Number.isNaN(parsed.getTime())) {
                return res.status(400).json({ ok: false, error: 'Son Kullanım Tarihi geçersiz' });
            }
            expiryDate = parsed;
        }
        const ref = body.ref && typeof body.ref === 'object'
            ? {
                kind: String(body.ref.kind || 'MANUAL').slice(0, 40),
                id: String(body.ref.id || '').slice(0, 120),
                ...(body.ref.lineId
                    ? { lineId: String(body.ref.lineId).slice(0, 120) }
                    : {}),
            }
            : { kind: 'MANUAL', id: '' };
        const result = await recordManualStockMovement({
            companyId,
            userId,
            createdByName: body.createdByName ? String(body.createdByName).slice(0, 120) : undefined,
            type: type,
            stockId: String(body.stockId || ''),
            sku: String(body.sku || ''),
            stockName: body.stockName ? String(body.stockName).slice(0, 200) : undefined,
            unit: body.unit ? String(body.unit).slice(0, 20) : 'ADT',
            locationId: String(body.locationId || ''),
            siteId: body.siteId ? String(body.siteId) : null,
            toLocationId: body.toLocationId ? String(body.toLocationId) : null,
            qty,
            unitCost,
            extras,
            ref,
            lotNo: body.lotNo ? String(body.lotNo).slice(0, 80) : null,
            expiryDate,
            toSiteName: body.toSiteName ? String(body.toSiteName).slice(0, 200) : null,
            confirmNegative: body.confirmNegative === true,
        });
        return res.json({ ok: true, ...result });
    }
    catch (error) {
        if (error?.code === 'NEGATIVE_STOCK_CONFIRM_REQUIRED' || error?.message === 'NEGATIVE_STOCK_CONFIRM_REQUIRED') {
            return res.status(409).json({
                ok: false,
                error: 'NEGATIVE_STOCK_CONFIRM_REQUIRED',
                currentQty: error.currentQty,
                message: 'Bu işlem stoku eksiye düşürecek. Onay gerekli.',
            });
        }
        const msg = error?.message || 'Stok hareketi kaydedilemedi';
        logger.error('POST /api/stock-movements failed', error);
        if (msg.includes('Yetersiz') ||
            msg.includes('stok yok') ||
            msg.includes('zorunlu') ||
            msg.includes('pozitif') ||
            msg.includes('Geçersiz') ||
            msg.includes('Düzeltme')) {
            return res.status(400).json({ ok: false, error: msg });
        }
        return respondError(res, Errors.internal(msg));
    }
});
/**
 * POST /api/stock-movements/sku-merge
 * SKU birleştirme (Admin SDK)
 */
router.post('/sku-merge', requireAnyPermission(['stock.edit', 'stock.create', 'stock.movements.adjust']), async (req, res) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return respondError(res, Errors.forbidden('Kimlik doğrulama gerekli'), 401);
        }
        const companyId = await getCompanyIdFromRequest(req);
        if (!companyId) {
            return respondError(res, Errors.forbidden('Şirket bilgisi bulunamadı'));
        }
        const sourceSku = String(req.body?.sourceSku || '').trim();
        const targetSku = String(req.body?.targetSku || '').trim();
        if (!sourceSku || !targetSku) {
            return res.status(400).json({ ok: false, error: 'sourceSku ve targetSku zorunlu' });
        }
        const { mergeSkusAdmin } = await import('../services/skuMergeService.js');
        const result = await mergeSkusAdmin({ companyId, sourceSku, targetSku, userId });
        return res.json({ ok: true, success: true, ...result });
    }
    catch (error) {
        const msg = error?.message || 'SKU birleştirme başarısız';
        logger.error('POST /api/stock-movements/sku-merge failed', error);
        if (msg.includes('bulunamadı') ||
            msg.includes('aynı') ||
            msg.includes('Eksik')) {
            return res.status(400).json({ ok: false, error: msg });
        }
        return respondError(res, Errors.internal(msg));
    }
});
export default router;
