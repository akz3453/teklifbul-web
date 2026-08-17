import express from "express";
import { computeInvitedSupplierIds } from "../services/inviteService.js";
import { getAdminDb } from "../../utils/firestore.js";
import { logger } from "../../../src/shared/log/logger.js";
import { logAuditEvent } from "../services/auditService.js";
import { getCompanyIdFromRequest } from "../services/permissionService.js";
const router = express.Router();
// Teklifbul Rule v1.0 - Allowed visibility/mode degerleri (whitelist validation)
const ALLOWED_DEMAND_VISIBILITY = new Set(["ozel", "liste-disi", "genel"]);
const ALLOWED_BID_VISIBILITY = new Set(["gizli", "acik", "hibrit"]);
const ALLOWED_INVITE_MODE = new Set(["auto", "custom"]);
/**
 * POST /api/demands
 * Yeni talep olustur. verifyToken middleware'i parent route'da uygulanir;
 * burada ek olarak ownerId/companyId istek sahibi ile zorunlu kilinir.
 */
router.post("/", async (req, res) => {
    try {
        const user = req.user;
        if (!user?.uid) {
            return res.status(401).json({ error: "AUTH_REQUIRED", message: "Oturum bulunamadi" });
        }
        const body = (req.body || {});
        if (!body.demandVisibility || !body.bidVisibility) {
            return res.status(400).json({ error: "MISSING_FIELDS", message: "Eksik alanlar" });
        }
        if (!ALLOWED_DEMAND_VISIBILITY.has(body.demandVisibility) ||
            !ALLOWED_BID_VISIBILITY.has(body.bidVisibility) ||
            (body.inviteMode && !ALLOWED_INVITE_MODE.has(body.inviteMode))) {
            return res.status(400).json({ error: "INVALID_VALUE", message: "Gecersiz alan degeri" });
        }
        if (typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.length > 500) {
            return res.status(400).json({ error: "INVALID_TITLE", message: "Baslik gecersiz" });
        }
        // ownerId istemciden gelse bile sunucu uid ile override edilir
        const enforcedOwnerId = user.uid;
        const trustedCompanyId = await getCompanyIdFromRequest(req);
        if (!trustedCompanyId) {
            return res.status(403).json({ error: "COMPANY_FORBIDDEN", message: "Gecerli sirket uyeligi bulunamadi" });
        }
        const safeBody = {
            ownerId: enforcedOwnerId,
            title: body.title.trim(),
            bidVisibility: body.bidVisibility,
            demandVisibility: body.demandVisibility,
            selectedGroupIds: Array.isArray(body.selectedGroupIds)
                ? body.selectedGroupIds.filter((s) => typeof s === 'string').slice(0, 200)
                : [],
            inviteMode: body.inviteMode || 'auto',
            invitedSupplierIds: Array.isArray(body.invitedSupplierIds)
                ? body.invitedSupplierIds.filter((s) => typeof s === 'string').slice(0, 500)
                : []
        };
        // Sunucu tarafi DOGRULAMA
        const invited = await computeInvitedSupplierIds(safeBody);
        const demandDoc = {
            ...safeBody,
            invitedSupplierIds: invited,
            creatorCompanyId: trustedCompanyId,
            createdBy: enforcedOwnerId,
            createdAt: new Date(),
        };
        // Firestore'a kaydet
        const db = await getAdminDb();
        let savedId = null;
        if (db) {
            try {
                const docRef = await db.collection("demands").add(demandDoc);
                savedId = docRef.id;
                logger.info('Talep kaydedildi', { demandId: savedId, ownerId: enforcedOwnerId });
                await logAuditEvent({
                    companyId: trustedCompanyId,
                    entityType: 'demand',
                    entityId: savedId,
                    action: 'create',
                    actorUserId: enforcedOwnerId,
                    result: 'success',
                    metadata: {
                        title: safeBody.title,
                        visibility: safeBody.demandVisibility
                    }
                });
            }
            catch (error) {
                logger.error('Firestore kayit hatasi', error);
                return res.status(500).json({ error: "PERSIST_ERROR", message: "Talep kaydedilemedi" });
            }
        }
        else {
            logger.warn('Firestore unavailable, demand not persisted');
            return res.status(503).json({ error: "DB_UNAVAILABLE", message: "Veritabani kullanilamiyor" });
        }
        return res.status(201).json({
            ok: true,
            demand: {
                ...demandDoc,
                id: savedId,
                createdAt: demandDoc.createdAt.toISOString(),
            }
        });
    }
    catch (e) {
        logger.error('Demand creation error', e);
        return res.status(500).json({ error: "INTERNAL_ERROR", message: "Sunucu hatasi" });
    }
});
export default router;
