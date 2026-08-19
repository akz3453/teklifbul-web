/**
 * Groups API Routes
 * Kategori grupları API endpoint'leri
 */
import express from "express";
import { resolveGroupMembers } from "../services/inviteService.js";
import { getAdminDb } from "../../utils/firestore.js";
import { logger } from "../../../src/shared/log/logger.js";
const router = express.Router();
/**
 * GET /api/groups/members
 * Group ID'lerinden supplier bilgilerini getir.
 * Teklifbul Rule v1.0 - verifyToken parent route'da uygulanir, uid sunucu uid'sine zorlanir.
 */
router.get("/members", async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser?.uid) {
            return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Oturum bulunamadi' });
        }
        const ids = String(req.query.ids || "").split(",").filter(Boolean).slice(0, 50);
        if (!ids.length) {
            return res.json([]);
        }
        // Teklifbul Rule v1.0 - uid sunucu tarafindan req.user.uid'e zorlanir.
        const uid = authUser.uid;
        const db = await getAdminDb();
        if (!db) {
            logger.warn('Firestore unavailable, returning empty list');
            return res.json([]);
        }
        // Group ID'lerinden supplier ID'lerini çözümle
        const supplierIds = await resolveGroupMembers(ids, uid);
        if (supplierIds.length === 0) {
            return res.json([]);
        }
        // Firestore'dan supplier bilgilerini çek
        const suppliers = await Promise.all(supplierIds.map(async (id) => {
            try {
                const userDoc = await db.collection('users').doc(id).get();
                if (userDoc.exists) {
                    const data = userDoc.data();
                    return {
                        id,
                        name: data?.displayName || data?.name || data?.companyName || id
                    };
                }
                return { id, name: id };
            }
            catch (error) {
                logger.warn('Supplier lookup failed', { id, error: error.message });
                return { id, name: id };
            }
        }));
        res.json(suppliers);
    }
    catch (error) {
        logger.error('Groups members error', error);
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});
export default router;
