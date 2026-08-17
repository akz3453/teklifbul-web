/**
 * Tax Offices API Routes
 * Teklifbul Rule v1.0 - Structured Logging
 *
 * Firestore + In-Memory Cache kullanıyor - $0 maliyet
 */
import { Router } from 'express';
import { getProvinces, getTaxOffices } from '../../../services/firestore-tax-offices.js';
import { logger } from '../../../shared/log/logger.js';
const router = Router();
// GET /api/tax-offices/provinces - İl listesi
router.get('/provinces', async (_req, res) => {
    try {
        const provinces = await getProvinces();
        res.json(provinces);
    }
    catch (e) {
        logger.error('Tax offices provinces error:', e);
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
});
// GET /api/tax-offices - İl/İlçe bazlı vergi daireleri listesi
router.get('/', async (req, res) => {
    try {
        let { province, district } = req.query;
        if (!province || typeof province !== 'string') {
            return res.status(400).json({ error: 'province parameter is required' });
        }
        // URL decode ve normalize - Teklifbul Rule v1.0
        province = decodeURIComponent(province).trim();
        if (district && typeof district === 'string') {
            district = decodeURIComponent(district).trim();
        }
        const offices = await getTaxOffices({
            province,
            district: district
        });
        res.json(offices);
    }
    catch (e) {
        logger.error('Tax offices list error:', e);
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
});
export default router;
