import express from 'express';
import { getCompanyIdFromRequest } from '../src/services/permissionService.js';
import { logger } from '../../src/shared/log/logger.js';
const router = express.Router();
/**
 * Teklifbul Rule v1.0 — FEFO inventory API tenant gate.
 * Postgres katmanı company scope'suz olduğu için yazma uçları fail-closed.
 * verifyToken mount'ta; burada trusted companyId zorunlu.
 */
async function requireTenant(req, res) {
    const companyId = await getCompanyIdFromRequest(req);
    if (!companyId) {
        res.status(403).json({ success: false, message: 'Geçerli şirket bilgisi gerekli' });
        return null;
    }
    return companyId;
}
/**
 * 1. Mal Kabul (Inbound) — tenant-scoped deploy tamamlanana kadar kapalı
 */
router.post('/inbound', async (req, res) => {
    const companyId = await requireTenant(req, res);
    if (!companyId)
        return;
    logger.warn('FEFO inbound blocked: tenant SQL scope pending', { companyId, userId: req.user?.uid });
    return res.status(503).json({
        success: false,
        message: 'FEFO mal kabul API geçici olarak kapalı (kiracı izolasyonu).',
    });
});
/**
 * 2. POS Satışı — tenant-scoped deploy tamamlanana kadar kapalı
 */
router.post('/sale', async (req, res) => {
    const companyId = await requireTenant(req, res);
    if (!companyId)
        return;
    logger.warn('FEFO sale blocked: tenant SQL scope pending', { companyId, userId: req.user?.uid });
    return res.status(503).json({
        success: false,
        message: 'FEFO satış API geçici olarak kapalı (kiracı izolasyonu).',
    });
});
/**
 * 3. KPI Dashboard — tenant-scoped deploy tamamlanana kadar kapalı
 */
router.get('/dashboard-stats', async (req, res) => {
    const companyId = await requireTenant(req, res);
    if (!companyId)
        return;
    logger.warn('FEFO dashboard blocked: tenant SQL scope pending', { companyId, userId: req.user?.uid });
    return res.status(503).json({
        success: false,
        message: 'FEFO dashboard API geçici olarak kapalı (kiracı izolasyonu).',
    });
});
export default router;
