// Teklifbul Rule v1.0
import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { listSubscriptions, listUpcomingRenewals, listFailedPaymentIntents } from '../services/subscriptionService.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { isPremiumBypassEmail } from '../utils/premiumBypass.js';
// Teklifbul Rule v1.0 - Input Validation
import { validateRequest } from '../utils/input-validation.js';
import { z } from 'zod';
const router = Router();
router.use(verifyToken, requireAdmin);
// Teklifbul Rule v1.0 - Şirket bazlı paket listesi
router.get('/companies/subscriptions', validateRequest({
    query: z.object({
        planId: z.string().optional().default('all'),
        limit: z.coerce.number().int().min(1).max(1000).optional().default(100)
    })
}), async (req, res) => {
    try {
        logger.group('Admin companies subscriptions list');
        const { planId = 'all', limit } = req.query;
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Companies koleksiyonundan şirketleri çek
        // Teklifbul Rule v1.0 - Plan filtresi normalize edilmiş planId'ye göre yapılacak
        // Bu yüzden önce tüm şirketleri çekip sonra filtreleyeceğiz
        let query = db.collection('companies');
        query = query.limit(limit ? Number(limit) * 3 : 1000); // Daha fazla çek, filtreleme sonrası limit uygulanacak
        const companiesSnap = await query.get();
        // Her şirket için kullanıcı sayısını ve detayları al
        const companies = await Promise.all(companiesSnap.docs.map(async (doc) => {
            const companyData = doc.data();
            const companyId = doc.id;
            // Şirketteki kullanıcı sayısını al (companyId veya activeCompanyId)
            const [usersByCompanyId, usersByActiveCompanyId] = await Promise.all([
                db.collection('users').where('companyId', '==', companyId).get(),
                db.collection('users').where('activeCompanyId', '==', companyId).get(),
            ]);
            const userMap = new Map();
            for (const snap of [usersByCompanyId, usersByActiveCompanyId]) {
                for (const u of snap.docs) {
                    if (userMap.has(u.id))
                        continue;
                    const ud = u.data() || {};
                    userMap.set(u.id, {
                        uid: u.id,
                        email: ud.email || ud.contactEmails?.[0] || undefined,
                        displayName: ud.displayName || ud.name || undefined,
                    });
                }
            }
            const users = Array.from(userMap.values());
            const userCount = users.length;
            // Teklifbul Rule v1.0 - Vergi no: taxNumber (asıl alan) + legacy + tax-{vkn} id
            const rawTax = companyData.taxNumber ||
                companyData.taxId ||
                companyData.taxNo ||
                companyData.vkn ||
                '';
            let taxId = String(rawTax || '').trim();
            if (!taxId && typeof companyId === 'string' && companyId.startsWith('tax-')) {
                taxId = companyId.slice(4).trim();
            }
            if (!taxId)
                taxId = '-';
            // Teklifbul Rule v1.0 - Kurucu mail: ownerId / ownerUid / createdBy
            const ownerUid = companyData.ownerId ||
                companyData.ownerUid ||
                companyData.createdBy ||
                companyData.createdByUid ||
                null;
            let founderEmail = companyData.ownerEmail ||
                companyData.founderEmail ||
                companyData.createdByEmail ||
                '';
            if (!founderEmail && ownerUid) {
                const fromList = userMap.get(String(ownerUid));
                if (fromList?.email) {
                    founderEmail = fromList.email;
                }
                else {
                    try {
                        const ownerDoc = await db.collection('users').doc(String(ownerUid)).get();
                        if (ownerDoc.exists) {
                            const od = ownerDoc.data() || {};
                            founderEmail = od.email || od.contactEmails?.[0] || '';
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
            if (!founderEmail && users.length) {
                founderEmail = users[0].email || '';
            }
            founderEmail = String(founderEmail || '').trim() || '-';
            // Plan bilgilerini normalize et
            // Teklifbul Rule v1.0 - Plan normalizasyonu: Tüm olası field'ları kontrol et
            // Boş string, null, undefined değerleri 'free' olarak normalize et
            const rawPlanId = companyData.planId;
            const rawPlan = companyData.plan;
            const rawSubscriptionPlanId = companyData.subscriptionPlanId;
            const rawSubscriptionPlanIdNested = companyData.subscription?.planId;
            // Normalize: Boş string, null, undefined değerleri 'free' olarak kabul et
            const normalizePlanValue = (val) => {
                if (!val || val === '' || val === null || val === undefined)
                    return null;
                const trimmed = String(val).trim();
                return trimmed || null;
            };
            const normalizedPlanId = normalizePlanValue(rawPlanId) ||
                normalizePlanValue(rawPlan) ||
                normalizePlanValue(rawSubscriptionPlanId) ||
                normalizePlanValue(rawSubscriptionPlanIdNested) ||
                'free';
            const isPremium = companyData.isPremium === true || (normalizedPlanId && normalizedPlanId !== 'free');
            // Debug: Free plan kontrolü için log (sadece free filtresi aktifken)
            if (planId === 'free' && normalizedPlanId !== 'free') {
                logger.warn('Company has non-free planId but filter is free', {
                    companyId,
                    companyName: companyData.name || companyData.companyName,
                    rawPlanId,
                    rawPlan,
                    rawSubscriptionPlanId,
                    rawSubscriptionPlanIdNested,
                    normalizedPlanId
                });
            }
            // ExpiresAt kontrolü
            const expiresAt = companyData.premiumExpiresAt || companyData.expiresAt || companyData.subscription?.expiresAt;
            const expiresAtDate = expiresAt ? (expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt)) : null;
            // Teklifbul Rule v1.0 - Durum hesaplama: Plan ve Durum ayrı şeyler
            // Durum: abonelik durumu (aktif, süresi dolmuş, inaktif)
            // Plan: abonelik planı (free, premium_monthly, vb.)
            let subscriptionStatus = 'active'; // Abonelik durumu
            if (normalizedPlanId === 'free') {
                // Free plan: Durum "Aktif" (çünkü free plan süresiz)
                subscriptionStatus = 'active';
            }
            else if (isPremium && expiresAtDate) {
                // Premium plan: Süre kontrolü yap
                if (expiresAtDate < new Date()) {
                    subscriptionStatus = 'expired'; // Süresi dolmuş
                }
                else {
                    subscriptionStatus = 'active'; // Aktif premium
                }
            }
            else if (isPremium && !expiresAtDate) {
                // Premium plan ama expiresAt yok: Aktif sayılır
                subscriptionStatus = 'active';
            }
            // Teklifbul Rule v1.0 - Silinmiş firma kontrolü: Çoklu kriter
            // 1. Açıkça silinmiş olanlar (isDeleted, deletedAt)
            // 2. Kullanıcısı olmayan ve ismi olmayan firmalar (orphan companies)
            // 3. Kullanıcısı olmayan ve oluşturulma tarihi 30 günden eski firmalar
            const isExplicitlyDeleted = companyData.isDeleted === true || companyData.deletedAt != null;
            const hasNoUsers = userCount === 0;
            const hasNoName = !companyData.name && !companyData.companyName;
            const isOrphan = hasNoUsers && hasNoName;
            // Eski orphan firmaları tespit et (30 günden eski, kullanıcısız, isimsiz)
            let isOldOrphan = false;
            if (hasNoUsers && hasNoName && companyData.createdAt) {
                const createdAtDate = companyData.createdAt.toDate ? companyData.createdAt.toDate() : new Date(companyData.createdAt);
                const daysSinceCreation = (Date.now() - createdAtDate.getTime()) / (1000 * 60 * 60 * 24);
                isOldOrphan = daysSinceCreation > 30; // 30 günden eski orphan firmalar
            }
            const isDeleted = isExplicitlyDeleted || isOldOrphan;
            // Teklifbul Rule v1.0 - planId'yi string olarak garanti et (filtreleme için kritik)
            const finalPlanId = String(normalizedPlanId || 'free').trim();
            return {
                companyId,
                companyName: companyData.name || companyData.companyName || '-',
                taxId,
                taxNumber: taxId === '-' ? null : taxId,
                founderEmail,
                ownerUid: ownerUid || null,
                planId: finalPlanId, // String olarak garanti edilmiş planId
                isPremium,
                expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
                status: subscriptionStatus, // Durum: active, expired (plan değil!)
                isDeleted,
                userCount,
                users: users.slice(0, 5), // İlk 5 kullanıcıyı göster
                createdAt: companyData.createdAt ? (companyData.createdAt.toDate ? companyData.createdAt.toDate().toISOString() : companyData.createdAt) : null,
                updatedAt: companyData.updatedAt ? (companyData.updatedAt.toDate ? companyData.updatedAt.toDate().toISOString() : companyData.updatedAt) : null
            };
        }));
        // Teklifbul Rule v1.0 - Silinmiş firmaları filtrele
        let filteredCompanies = companies.filter(company => !company.isDeleted);
        // Plan filtresini normalize edilmiş planId'ye göre uygula
        if (planId && planId !== 'all') {
            // Free filtresi için özel kontrol: normalize edilmiş planId 'free' olanları filtrele
            filteredCompanies = filteredCompanies.filter(company => {
                // PlanId tam eşleşme kontrolü
                const matches = company.planId === planId;
                // Debug log (sadece free filtresi için)
                if (planId === 'free' && !matches && company.planId === 'free') {
                    logger.warn('Free filter mismatch', {
                        companyId: company.companyId,
                        companyName: company.companyName,
                        expectedPlanId: planId,
                        actualPlanId: company.planId,
                        planIdType: typeof company.planId
                    });
                }
                return matches;
            });
        }
        // Limit uygula (filtreleme sonrası)
        if (limit && filteredCompanies.length > limit) {
            filteredCompanies = filteredCompanies.slice(0, limit);
        }
        logger.info('Admin companies subscriptions list fetched', {
            total: companies.length,
            filtered: filteredCompanies.length,
            planFilter: planId
        });
        logger.end();
        res.json({ companies: filteredCompanies });
    }
    catch (error) {
        logger.error('Admin companies subscription list error', error);
        logger.end();
        res.status(200).json({ companies: [] });
    }
});
router.get('/subscriptions', validateRequest({
    query: z.object({
        status: z.enum(['all', 'active', 'trialing', 'past_due', 'canceled', 'unpaid']).optional().default('all'),
        planId: z.string().optional().default('all'),
        limit: z.coerce.number().int().min(1).max(1000).optional()
    })
}), async (req, res) => {
    try {
        logger.group('Admin subscriptions list');
        const { status = 'all', planId = 'all', limit } = req.query;
        const items = await listSubscriptions({
            status: typeof status === 'string' ? status : 'all',
            planId: typeof planId === 'string' ? planId : 'all',
            limit: limit ? Number(limit) : undefined
        });
        // Kullanıcı bilgilerini ekle
        const db = await getAdminDb();
        const subscriptions = await Promise.all(items.map(async (item) => {
            if (db && item.userId) {
                try {
                    const userDoc = await db.collection('users').doc(item.userId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        const userEmail = userData?.email || userData?.contactEmails?.[0] || null;
                        const mappedItem = {
                            ...item,
                            email: userEmail, // UI compatibility
                            userEmail,
                            companyName: userData?.companyName
                        };
                        if (isPremiumBypassEmail(userEmail)) {
                            mappedItem.planId = 'premium_plus_admin';
                            mappedItem.planName = 'Premium Plus (Admin)';
                            mappedItem.status = 'active';
                        }
                        return mappedItem;
                    }
                }
                catch (error) {
                    logger.warn('User data fetch failed for subscription', { userId: item.userId });
                }
            }
            return item;
        }));
        logger.info('Admin subscriptions list fetched', { count: subscriptions.length });
        logger.end();
        // Teklifbul Rule v1.0 - Backward compatibility: return both keys
        res.json({ items: subscriptions, subscriptions });
    }
    catch (error) {
        logger.error('Admin subscription list error', error);
        logger.end();
        // Teklifbul Rule v1.0 - Hata durumunda boş liste döndür (500 yerine 200)
        res.status(200).json({ items: [] });
    }
});
router.get('/subscriptions/upcoming', validateRequest({
    query: z.object({
        days: z.coerce.number().int().min(1).max(365).optional().default(7)
    })
}), async (req, res) => {
    try {
        logger.group('Admin upcoming renewals');
        const days = req.query.days || 7;
        const items = await listUpcomingRenewals({ days });
        logger.info('Admin upcoming renewals fetched', { count: items.length, days });
        logger.end();
        res.json({ items, days });
    }
    catch (error) {
        logger.error('Admin upcoming renewals error', error);
        logger.end();
        // Teklifbul Rule v1.0 - Hata durumunda boş liste döndür (500 yerine 200)
        const days = req.query.days ? Number(req.query.days) : 7;
        res.status(200).json({ items: [], days });
    }
});
// Teklifbul Rule v1.0 - Input Validation Schema for failed payments (no params needed)
router.get('/payments/failed', validateRequest({}), async (_req, res) => {
    try {
        logger.group('Admin failed payments');
        const items = await listFailedPaymentIntents(100);
        logger.info('Admin failed payments fetched', { count: items.length });
        logger.end();
        res.json({ items });
    }
    catch (error) {
        logger.error('Admin failed payments error', error);
        logger.end();
        // Teklifbul Rule v1.0 - Hata durumunda boş liste döndür (500 yerine 200)
        res.status(200).json({ items: [] });
    }
});
/**
 * Şirket planını değiştir - PUT /api/admin/companies/:companyId/subscription
 */
// Teklifbul Rule v1.0 - Input Validation Schema for company subscription update
const companyIdParamsSchema = z.object({
    companyId: z.string().min(1),
});
const subscriptionUpdateBodySchema = z.object({
    planId: z.enum(['free', 'premium', 'premium_monthly', 'premium_yearly', 'premium_plus', 'premium_plus_monthly', 'premium_plus_yearly']),
    expiresAt: z.string().datetime().optional(),
    startedAt: z.string().datetime().optional()
});
router.put('/companies/:companyId/subscription', validateRequest({
    params: companyIdParamsSchema,
    body: subscriptionUpdateBodySchema
}), async (req, res) => {
    logger.group('Admin update company subscription');
    try {
        const { companyId } = req.params;
        const { planId, expiresAt, startedAt } = req.body;
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Şirketi bul
        const companyDoc = await db.collection('companies').doc(companyId).get();
        if (!companyDoc.exists) {
            return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'Şirket bulunamadı' });
        }
        const companyData = companyDoc.data();
        const oldPlanId = companyData?.planId || companyData?.plan || 'free';
        // Şirket planını güncelle
        const updateData = {
            planId,
            updatedAt: FieldValue.serverTimestamp()
        };
        if (expiresAt) {
            updateData.premiumExpiresAt = new Date(expiresAt);
            updateData.expiresAt = new Date(expiresAt);
        }
        if (startedAt) {
            updateData.subscriptionStartedAt = new Date(startedAt);
        }
        if (planId !== 'free') {
            updateData.isPremium = true;
        }
        else {
            updateData.isPremium = false;
        }
        await db.collection('companies').doc(companyId).update(updateData);
        // Şirketteki tüm kullanıcıların planını güncelle (şirket bazlı premium için)
        const usersSnap = await db.collection('users')
            .where('companyId', '==', companyId)
            .get();
        const userUpdatePromises = usersSnap.docs.map(async (userDoc) => {
            const userUpdateData = {
                planId,
                updatedAt: FieldValue.serverTimestamp()
            };
            if (expiresAt) {
                userUpdateData.expiresAt = new Date(expiresAt);
            }
            if (startedAt) {
                userUpdateData.subscriptionStartedAt = new Date(startedAt);
            }
            if (planId !== 'free') {
                userUpdateData.isPremium = true;
            }
            else {
                userUpdateData.isPremium = false;
            }
            await userDoc.ref.update(userUpdateData);
        });
        await Promise.all(userUpdatePromises);
        // Subscription koleksiyonunu güncelle (şirket bazlı)
        if (planId !== 'free') {
            // Şirket bazlı subscription oluştur/güncelle
            const existingSubs = await db.collection('subscriptions')
                .where('companyId', '==', companyId)
                .where('status', '==', 'active')
                .get();
            if (existingSubs.empty) {
                // Yeni subscription oluştur
                await db.collection('subscriptions').add({
                    companyId,
                    planId,
                    status: 'active',
                    currentPeriodStart: startedAt ? new Date(startedAt) : FieldValue.serverTimestamp(),
                    currentPeriodEnd: expiresAt ? new Date(expiresAt) : FieldValue.serverTimestamp(),
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
            else {
                // Mevcut subscription'ı güncelle
                for (const subDoc of existingSubs.docs) {
                    await subDoc.ref.update({
                        planId,
                        currentPeriodEnd: expiresAt ? new Date(expiresAt) : subDoc.data().currentPeriodEnd,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }
            }
        }
        else {
            // Free plana düşürülürse aktif subscription'ları iptal et
            const existingSubs = await db.collection('subscriptions')
                .where('companyId', '==', companyId)
                .where('status', '==', 'active')
                .get();
            for (const subDoc of existingSubs.docs) {
                await subDoc.ref.update({
                    status: 'cancelled',
                    cancelAtPeriodEnd: false,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }
        // Teklifbul Rule v1.0 - Security: Admin aksiyonlarını logla
        const { serverLogger } = await import('../utils/logger.js');
        serverLogger.security.adminAction(req, 'update_company_subscription', companyId);
        logger.info('Şirket planı güncellendi', { companyId, oldPlanId, newPlanId: planId, userCount: usersSnap.size });
        logger.end();
        return res.json({ ok: true, companyId, planId, oldPlanId, userCount: usersSnap.size });
    }
    catch (error) {
        logger.error('Şirket planı güncelleme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
    }
});
/**
 * Kullanıcı planını değiştir - PUT /api/admin/subscriptions/:userId
 */
// Teklifbul Rule v1.0 - Input Validation Schema for user subscription update
const userIdParamsSchema = z.object({
    userId: z.string().min(1),
});
router.put('/subscriptions/:userId', validateRequest({
    params: userIdParamsSchema,
    body: subscriptionUpdateBodySchema
}), async (req, res) => {
    logger.group('Admin update subscription');
    try {
        const { userId } = req.params;
        const { planId, expiresAt, startedAt } = req.body;
        const db = await getAdminDb();
        if (!db) {
            return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
        }
        // Kullanıcıyı bul
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
        }
        const userData = userDoc.data();
        const oldPlanId = userData?.planId || 'free';
        // Kullanıcı planını güncelle
        const updateData = {
            planId,
            updatedAt: FieldValue.serverTimestamp()
        };
        if (expiresAt) {
            updateData.expiresAt = new Date(expiresAt);
        }
        if (startedAt) {
            updateData.subscriptionStartedAt = new Date(startedAt);
        }
        if (planId !== 'free') {
            updateData.isPremium = true;
        }
        else {
            updateData.isPremium = false;
        }
        await db.collection('users').doc(userId).update(updateData);
        // Subscription koleksiyonunu güncelle
        if (planId !== 'free') {
            const existingSubs = await db.collection('subscriptions')
                .where('userId', '==', userId)
                .where('status', '==', 'active')
                .get();
            if (existingSubs.empty) {
                // Yeni subscription oluştur
                await db.collection('subscriptions').add({
                    userId,
                    planId,
                    status: 'active',
                    currentPeriodStart: startedAt ? new Date(startedAt) : FieldValue.serverTimestamp(),
                    currentPeriodEnd: expiresAt ? new Date(expiresAt) : FieldValue.serverTimestamp(),
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
            else {
                // Mevcut subscription'ı güncelle
                for (const subDoc of existingSubs.docs) {
                    await subDoc.ref.update({
                        planId,
                        currentPeriodEnd: expiresAt ? new Date(expiresAt) : subDoc.data().currentPeriodEnd,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }
            }
        }
        else {
            // Free plana düşürülürse aktif subscription'ları iptal et
            const existingSubs = await db.collection('subscriptions')
                .where('userId', '==', userId)
                .where('status', '==', 'active')
                .get();
            for (const subDoc of existingSubs.docs) {
                await subDoc.ref.update({
                    status: 'cancelled',
                    cancelAtPeriodEnd: false,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }
        // Teklifbul Rule v1.0 - Security: Admin aksiyonlarını logla
        const { serverLogger } = await import('../utils/logger.js');
        serverLogger.security.adminAction(req, 'update_subscription', userId);
        logger.info('Kullanıcı planı güncellendi', { userId, oldPlanId, newPlanId: planId });
        logger.end();
        return res.json({ ok: true, userId, planId, oldPlanId });
    }
    catch (error) {
        logger.error('Plan güncelleme hatası', error);
        logger.end();
        return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
    }
});
export default router;
