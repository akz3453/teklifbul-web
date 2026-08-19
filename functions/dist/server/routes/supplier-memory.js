/**
 * Supplier Memory API Routes
 * Teklifbul Rule v1.0 - Production Hardening
 *
 * POST /api/supplier-memory/save-mapping - Kolon eşleştirme kaydetme
 */
import { Router } from 'express';
import { getSupplierMemoryStore } from '../services/supplierMemory.js';
import { logger } from '../../src/shared/log/logger.js';
import { getCachedUserDoc } from '../src/utils/userDocCache.js';
import { resolveTrustedCompanyIdAsync } from '../utils/companyAccess.js';
const router = Router();
/**
 * POST /api/supplier-memory/save-mapping
 * Kolon eşleştirme kaydını kaydet — company-scoped key
 */
router.post('/save-mapping', async (req, res) => {
    logger.group('Supplier Memory - Mapping Kaydetme');
    try {
        const userId = req.user?.uid;
        if (!userId) {
            logger.end();
            return res.status(401).json({ ok: false, error: 'auth_required' });
        }
        const userDoc = await getCachedUserDoc(userId, req);
        const userData = userDoc.exists ? userDoc.data : null;
        const headerCompanyId = req.headers['x-company-id'];
        const companyId = await resolveTrustedCompanyIdAsync(userData, headerCompanyId, {
            userId,
            path: req.path,
        });
        if (!companyId) {
            logger.end();
            return res.status(403).json({ ok: false, error: 'company_required' });
        }
        const { supplierId, filename, mappings } = req.body || {};
        if (!Array.isArray(mappings)) {
            logger.error('Geçersiz request', { mappings });
            logger.end();
            return res.status(400).json({
                ok: false,
                error: 'mappings_required',
                details: 'Mappings array gerekli',
            });
        }
        // Kiracı anahtarı: companyId + supplierId
        const scopedSupplierId = `${companyId}::${supplierId || 'unknown'}`;
        const store = getSupplierMemoryStore();
        let saved = 0;
        mappings.forEach((mapping) => {
            if (mapping.field && mapping.columnLabel) {
                const confidence = mapping.confidence || mapping.score || 0.8;
                store.remember(scopedSupplierId, mapping.columnLabel, mapping.field, confidence, filename);
                saved++;
            }
        });
        logger.info('Eşleştirme kaydedildi', { companyId, supplierId, filename, saved });
        logger.end();
        return res.json({
            ok: true,
            message: 'Eşleştirme kaydedildi',
            saved,
        });
    }
    catch (e) {
        logger.error('Mapping kayıt hatası', e);
        logger.end();
        return res.status(500).json({
            ok: false,
            error: 'server_error',
            details: e.message || String(e),
        });
    }
});
export default router;
