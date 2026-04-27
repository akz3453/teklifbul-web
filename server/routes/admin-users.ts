// Teklifbul Rule v1.0 - Admin Kullanıcı Yönetimi
import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { serverLogger } from '../utils/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
// Teklifbul Rule v1.0 - Input Validation
import { validateRequest, commonSchemas } from '../utils/input-validation.js';
import { z } from 'zod';

const router = Router();

// Diğer route'lar için admin zorunlu
router.use(verifyToken, requireAdmin);

// Teklifbul Rule v1.0 - Input Validation Schema
const searchUsersQuerySchema = z.object({
  email: z.string().email().optional(),
  uid: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
}).refine(data => data.email || data.uid, {
  message: 'Email veya UID gerekli'
});

/**
 * Kullanıcı arama - GET /api/admin/users/search
 */
router.get('/users/search',
  validateRequest({ query: searchUsersQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('admin-users:search');
  try {
    const { email, uid, limit = '50' } = req.query;
    
    if (!email && !uid) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Email veya UID gerekli' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    let userDoc;
    if (uid) {
      userDoc = await db.collection('users').doc(uid as string).get();
    } else if (email) {
      // Email ile kullanıcı bulma - önce Firestore'dan dene (daha hızlı)
      const emailLower = (email as string).toLowerCase().trim();
      
      // Önce email field'ından ara
      let usersSnapshot = await db.collection('users')
        .where('email', '==', emailLower)
        .limit(1)
        .get();
      
      // Bulunamazsa contactEmails array'inde ara
      if (usersSnapshot.empty) {
        usersSnapshot = await db.collection('users')
          .where('contactEmails', 'array-contains', emailLower)
          .limit(1)
          .get();
      }
      
      // Hala bulunamazsa Firebase Auth'dan dene (fallback)
      if (usersSnapshot.empty) {
        try {
          const userRecord = await admin.auth().getUserByEmail(emailLower);
          userDoc = await db.collection('users').doc(userRecord.uid).get();
        } catch (authError: any) {
          if (authError.code === 'auth/user-not-found' || authError.code === 'auth/internal-error') {
            return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
          }
          throw authError;
        }
      } else {
        userDoc = usersSnapshot.docs[0];
      }
    }

    if (!userDoc || !userDoc.exists) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
    }

    const userData = userDoc.data();
    
    // Firebase Auth bilgilerini al
    let authUser;
    try {
      authUser = await admin.auth().getUser(userDoc.id);
    } catch (e) {
      logger.warn('Firebase Auth user not found', { uid: userDoc.id });
    }

    logger.info('Kullanıcı bulundu', { uid: userDoc.id, email: userData?.email });
    logger.end();
    return res.json({
      uid: userDoc.id,
      email: authUser?.email || userData?.email || userData?.contactEmails?.[0],
      emailVerified: authUser?.emailVerified || false,
      planId: userData?.planId || 'free',
      isPremium: userData?.isPremium || false,
      expiresAt: userData?.expiresAt,
      subscriptionStartedAt: userData?.subscriptionStartedAt,
      companyId: userData?.companyId || userData?.activeCompanyId,
      contactEmails: userData?.contactEmails,
      ai_provider: userData?.ai_provider,
      createdAt: userData?.createdAt,
      ...userData
    });
  } catch (error: any) {
    logger.error('Kullanıcı arama hatası', error);
    logger.end();
    return res.status(500).json({ error: 'SEARCH_ERROR', message: error.message });
  }
});

/**
 * Kullanıcı listesi - GET /api/admin/users/list
 * Basit listeleme, limit parametresi ile (varsayılan 100)
 */
// Teklifbul Rule v1.0 - Input Validation Schema for list
const listUsersQuerySchema = z.object({
  status: z.enum(['all', 'pending', 'approved', 'rejected']).optional().default('all'),
  planId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

router.get('/users/list',
  validateRequest({ query: listUsersQuerySchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('admin-users:list');
  try {
    // Teklifbul Rule v1.0 - Cursor-based pagination
    const { limit = '100', planId, isPremium, pageSize, cursor } = req.query;
    const parsedLimit = Math.min(Number(limit) || 100, 500);
    const parsedPageSize = pageSize ? Math.min(Number(pageSize) || 50, 500) : 50;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    // Plan filtresi (tek veya çoklu)
    const planIds = Array.isArray(planId)
      ? planId
      : typeof planId === 'string' && planId.includes(',')
        ? planId.split(',').map(p => p.trim()).filter(Boolean)
        : planId
          ? [planId]
          : [];

    // Teklifbul Rule v1.0 - Cursor-based pagination sadece planId filtresi yoksa kullanılabilir
    // (orderBy gerektirir, composite index gerektirmez)
    let query: any = db.collection('users');
    let snapshot;
    let cursorDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    
    // Cursor parse ve doğrulama
    if (cursor && typeof cursor === 'string' && planIds.length === 0) {
      try {
        const [cursorMillisStr, cursorId] = cursor.split(':');
        const cursorMillis = Number(cursorMillisStr);
        
        if (!cursorId || isNaN(cursorMillis)) {
          return res.status(400).json({ error: 'INVALID_CURSOR', message: 'Geçersiz cursor formatı' });
        }
        
        cursorDoc = await db.collection('users').doc(cursorId).get();
        if (!cursorDoc.exists) {
          return res.status(400).json({ error: 'INVALID_CURSOR', message: 'Cursor dokümanı bulunamadı' });
        }
        
        const cursorData = cursorDoc.data();
        const createdAt = cursorData?.createdAt;
        const createdAtMillis = createdAt?.toMillis?.() ?? (createdAt instanceof Date ? createdAt.getTime() : (typeof createdAt === 'number' ? createdAt : null));
        
        if (createdAtMillis === null || createdAtMillis !== cursorMillis) {
          return res.status(400).json({ error: 'INVALID_CURSOR', message: 'Cursor timestamp uyuşmuyor' });
        }
      } catch (cursorError: any) {
        logger.warn('Cursor parse hatası', cursorError);
        return res.status(400).json({ error: 'INVALID_CURSOR', message: cursorError.message || 'Cursor işlenemedi' });
      }
    }
    
    if (planIds.length === 1 && planIds[0] === 'free') {
      // Free filtresi: planId yok veya planId === 'free' olan kullanıcıları getir
      // Firestore'da planId field'ı olmayan kullanıcılar için özel sorgu yapamayız
      // Bu yüzden tüm kullanıcıları getirip client-side'da filtreleyeceğiz
      query = db.collection('users').limit(parsedLimit * 2); // Daha fazla getir, client-side'da filtrele
      snapshot = await query.get();
    } else if (planIds.length > 0) {
      // Premium planları için normal query (cursor-based pagination kullanılamaz - orderBy yok)
      if (planIds.length === 1) {
        query = query.where('planId', '==', planIds[0]);
      } else {
        query = query.where('planId', 'in', planIds.slice(0, 10));
      }
      query = query.limit(parsedLimit);
      snapshot = await query.get();
    } else {
      // Plan filtresi yoksa orderBy ekle ve cursor-based pagination kullan
      query = query.orderBy('createdAt', 'desc');
      query = query.limit(parsedPageSize);
      
      if (cursorDoc) {
        query = query.startAfter(cursorDoc);
      }
      
      snapshot = await query.get();
    }

    // Teklifbul Rule v1.0 - PERFORMANS: Firebase Auth kontrolü opsiyonel ve paralel yapılıyor
    // Auth kontrolü yavaş olduğu için opsiyonel parametre ile kontrol edilebilir
    const checkAuth = req.query.checkAuth !== 'false'; // Varsayılan: true (geriye dönük uyumluluk)
    const allUids = snapshot.docs.map((doc: any) => doc.id);
    const authUidSet = new Set<string>();
    let authCheckError: any = null;
    let partialSuccess = false;
    
    // Auth kontrolü opsiyonel - performans için atlanabilir
    if (checkAuth && allUids.length > 0) {
      try {
        // Firebase Admin SDK getUsers ile toplu kontrol (limit 1000)
        // UID'leri 100'lük gruplara böl (Firebase limit)
        const batchSize = 100;
        // PERFORMANS: Paralel batch işleme (Promise.all ile)
        const batchPromises: Promise<void>[] = [];
        
        for (let i = 0; i < allUids.length; i += batchSize) {
          const batch = allUids.slice(i, i + batchSize);
          const batchIndex = Math.floor(i / batchSize) + 1;
          
          // Her batch'i paralel olarak işle
          const batchPromise = (async () => {
            try {
              const getUserIdentifiers = batch.map((uid: string) => ({ uid }));
              const getUsersResult = await admin.auth().getUsers(getUserIdentifiers);
              
              // Thread-safe: Set'e ekleme
              getUsersResult.users.forEach(user => {
                authUidSet.add(user.uid);
              });
              
              partialSuccess = true;
              
              logger.info('Auth toplu kontrol - batch işlendi', { 
                batchIndex,
                totalBatches: Math.ceil(allUids.length / batchSize),
                found: getUsersResult.users.length,
                notFound: getUsersResult.notFound.length
              });
            } catch (batchError: any) {
              const errorCode = batchError.code || '';
              const errorMessage = (batchError.message || '').toLowerCase();
              
              if (errorCode === 'app/invalid-credential' || 
                  errorMessage.includes('invalid-credential') ||
                  errorMessage.includes('failed to fetch a valid google oauth2 access token') ||
                  errorMessage.includes('enotfound metadata.google.internal')) {
                if (!partialSuccess) {
                  authCheckError = batchError;
                }
                logger.warn('⚠️ Auth toplu kontrol - batch credential hatası', { 
                  batchIndex,
                  errorCode,
                  errorMessage: batchError.message || ''
                });
              } else {
                logger.warn('⚠️ Auth toplu kontrol - batch hatası', { 
                  batchIndex,
                  errorCode,
                  errorMessage: batchError.message || ''
                });
              }
            }
          })();
          
          batchPromises.push(batchPromise);
        }
        
        // Tüm batch'leri paralel olarak bekle (max 5 paralel batch - rate limit koruması)
        const maxConcurrent = 5;
        for (let i = 0; i < batchPromises.length; i += maxConcurrent) {
          const concurrentBatches = batchPromises.slice(i, i + maxConcurrent);
          await Promise.all(concurrentBatches);
        }
      } catch (error: any) {
        if (!partialSuccess) {
          authCheckError = error;
        }
        logger.error('Auth toplu kontrol - genel hata', error);
      }
      
      // Debug: Auth kontrolü sonuçları
      const authExistsTrue = Array.from(authUidSet).length;
      const authExistsFalse = allUids.length - authExistsTrue;
      logger.info('Auth toplu kontrol - özet', { 
        total: allUids.length,
        authExistsTrue,
        authExistsFalse,
        hasError: authCheckError !== null,
        partialSuccess
      });
    } else {
      // Auth kontrolü atlandı - performans için
      logger.info('Auth kontrolü atlandı (performans)', { 
        checkAuth,
        totalUsers: allUids.length 
      });
    }
    
    // Teklifbul Rule v1.0 - Şirket planlarını alarak kullanıcı planlarını senkronize et
    const companyIds = Array.from(new Set(snapshot.docs.map((d: any) => {
      const data = d.data() || {};
      return data.companyId || data.activeCompanyId;
    }).filter(Boolean)));
    
    const companyMap = new Map();
    if (companyIds.length > 0) {
      try {
        // Firestore 'in' query has max 10 elements limit, chunk them
        const chunks = [];
        for (let i = 0; i < companyIds.length; i += 10) {
          chunks.push(companyIds.slice(i, i + 10));
        }
        
        await Promise.all(chunks.map(async (chunk) => {
          const compSnap = await db.collection('companies').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
          compSnap.forEach((c: any) => companyMap.set(c.id, c.data()));
        }));
      } catch (err) {
        logger.warn('Sirket bilgileri alinamadi (user listesi icin)', err);
      }
    }

    // Kullanıcı verilerini işle
    const users = snapshot.docs.map((doc: any) => {
      const data = doc.data() || {};
      const uid = doc.id;
      
      // Auth kontrolü sonucu
      let authExists: boolean | null = null;
      if (authCheckError && !partialSuccess) {
        authExists = null;
      } else {
        authExists = authUidSet.has(uid);
      }
      
      const baseIsActive = data.isActive !== false && data.status !== 'inactive';
      const isActive = authExists === false ? false : baseIsActive;
      
      // Teklifbul Rule v1.0 - Şirket planına göre kullanıcı planını güncelle (UI senkronizasyonu)
      let planId = data.planId || 'free';
      let isPremium = data.isPremium === true;
      let expiresAtRaw = data.expiresAt;
      
      const companyId = data.companyId || data.activeCompanyId;
      if (companyId && companyMap.has(companyId)) {
        const compData = companyMap.get(companyId);
        const compPlan = compData.planId || compData.plan || compData.subscriptionPlanId || compData.subscription?.planId || 'free';
        
        // Eğer şirketin premium planı varsa, kullanıcıya uygula (Free değilse)
        if (compPlan !== 'free' && compPlan !== '') {
          planId = compPlan;
          isPremium = true;
          expiresAtRaw = compData.premiumExpiresAt || compData.expiresAt || compData.subscription?.expiresAt || expiresAtRaw;
        }
      }
      
      // createdAt timestamp'i Date'e çevir
      let createdAt = null;
      if (data.createdAt) {
        if (data.createdAt.toDate) {
          createdAt = data.createdAt.toDate();
        } else if (data.createdAt instanceof Date) {
          createdAt = data.createdAt;
        } else if (typeof data.createdAt === 'number') {
          createdAt = new Date(data.createdAt);
        }
      }
      
      // expiresAt timestamp'i Date'e çevir
      let expiresAt = null;
      if (expiresAtRaw) {
        if (expiresAtRaw.toDate) {
          expiresAt = expiresAtRaw.toDate();
        } else if (expiresAtRaw instanceof Date) {
          expiresAt = expiresAtRaw;
        } else if (typeof expiresAtRaw === 'number' || typeof expiresAtRaw === 'string') {
          expiresAt = new Date(expiresAtRaw);
        }
      }
      
      return {
        uid: uid,
        email: data.email || data.contactEmails?.[0] || '',
        companyName: data.companyName || '',
        displayName: data.displayName || data.name || '',
        taxId: data.taxId || '',
        planId: planId,
        isPremium: isPremium,
        emailVerified: data.emailVerified === true,
        authExists: authExists, // Teklifbul Rule v1.0 - Firebase Auth'ta kullanıcı var mı?
        isActive: isActive,
        createdAt: createdAt ? createdAt.toISOString() : null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        status: isActive ? 'active' : 'inactive',
      };
    });
    
    // Free filtresi için client-side filtreleme (planId yok veya 'free' olanlar)
    let finalUsers = users;
    if (planIds.length === 1 && planIds[0] === 'free') {
      finalUsers = users.filter((user: any) => {
        const userPlanId = user.planId || 'free';
        return userPlanId === 'free' && !user.isPremium;
      });
      // Limit uygula
      finalUsers = finalUsers.slice(0, parsedLimit);
    }
    
    // Plan filtresi varsa ve orderBy kullanmadıysak, client-side'da sırala
    if (planIds.length > 0) {
      finalUsers.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime; // desc
      });
    }

    // Cursor-based pagination: nextCursor ve hasMore hesapla
    let nextCursor: string | null = null;
    let hasMore = false;
    
    if (planIds.length === 0 && snapshot.docs.length > 0) {
      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      const lastData = lastDoc.data();
      const lastCreatedAt = lastData?.createdAt;
      const lastCreatedAtMillis = lastCreatedAt?.toMillis?.() ?? (lastCreatedAt instanceof Date ? lastCreatedAt.getTime() : (typeof lastCreatedAt === 'number' ? lastCreatedAt : null));
      
      if (lastCreatedAtMillis !== null) {
        nextCursor = `${lastCreatedAtMillis}:${lastDoc.id}`;
      }
      
      hasMore = snapshot.size === parsedPageSize;
    }

    logger.info('Kullanıcı listesi alındı', { count: finalUsers.length, planIds, hasMore, nextCursor: nextCursor ? '...' : null });
    logger.end();
    return res.json({ users: finalUsers, nextCursor, hasMore });
  } catch (error: any) {
    logger.error('Kullanıcı listesi hatası', error);
    logger.end();
    
    // Firestore index hatası kontrolü
    if (error.message && (error.message.includes('index') || error.message.includes('Index'))) {
      return res.status(500).json({ 
        error: 'INDEX_REQUIRED', 
        message: 'Firestore index gerekli. Lütfen Firebase Console\'dan index oluşturun.',
        details: error.message
      });
    }
    
    return res.status(500).json({ 
      error: 'LIST_ERROR', 
      message: error.message || 'Kullanıcı listesi alınamadı',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Kullanıcı planını güncelle - POST /api/admin/users/:uid/plan
 */
// Teklifbul Rule v1.0 - Input Validation Schema for plan update
const updatePlanParamsSchema = z.object({
  identifier: z.string().min(1),
});

const updatePlanBodySchema = z.object({
  planId: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

router.post('/users/:identifier/plan',
  validateRequest({ 
    params: updatePlanParamsSchema,
    body: updatePlanBodySchema 
  }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('admin-users:update-plan');
  try {
    const { identifier } = req.params; // Artık uid veya email olabilir
    const { planId, expiresAt, startedAt, aiProvider } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'planId gerekli' });
    }

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    // Kullanıcıyı bul - identifier email mi uid mi kontrol et
    let userDoc;
    let uid: string;
    
    // Email formatında mı kontrol et (basit kontrol: @ işareti varsa email)
    if (identifier.includes('@')) {
      const emailLower = identifier.toLowerCase().trim();
      
      // Firestore'dan email ile ara
      let usersSnapshot = await db.collection('users')
        .where('email', '==', emailLower)
        .limit(1)
        .get();
      
      if (usersSnapshot.empty) {
        usersSnapshot = await db.collection('users')
          .where('contactEmails', 'array-contains', emailLower)
          .limit(1)
          .get();
      }
      
      if (usersSnapshot.empty) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
      }
      
      userDoc = usersSnapshot.docs[0];
      uid = userDoc.id;
    } else {
      // UID formatında
      uid = identifier;
      userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
      }
    }

    const userData = userDoc.data();
    // Teklifbul Rule v1.0 - undefined değerleri filtrele (Firestore undefined kabul etmez)
    const updateData: any = {
      planId,
      isPremium: planId !== 'free',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user?.uid || 'admin',
    };

    // StartedAt varsa ekle
    if (startedAt) {
      updateData.subscriptionStartedAt = startedAt instanceof Date ? startedAt : new Date(startedAt);
    } else if (planId !== 'free' && !userData?.subscriptionStartedAt) {
      // Başlangıç tarihi yoksa bugünü kullan
      updateData.subscriptionStartedAt = new Date();
    }

    // ExpiresAt varsa ekle
    if (expiresAt) {
      updateData.expiresAt = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    } else if (planId !== 'free') {
      // Bitiş tarihi yoksa plan tipine göre otomatik hesapla
      const startDate = updateData.subscriptionStartedAt || userData?.subscriptionStartedAt || new Date();
      const start = startDate instanceof Date ? startDate : new Date(startDate);
      const endDate = new Date(start);
      
      if (planId.includes('yearly')) {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else if (planId.includes('monthly')) {
        endDate.setMonth(endDate.getMonth() + 1);
      } else {
        // premium_plus için varsayılan 1 yıl
        endDate.setFullYear(endDate.getFullYear() + 1);
      }
      updateData.expiresAt = endDate;
    } else if (planId === 'free') {
      // Ücretsiz plana düşürülürse bitiş tarihini kaldır
      updateData.expiresAt = null;
    }

    // AI Provider varsa ekle (Premium Plus için)
    if (aiProvider && (planId === 'premium_plus' || planId === 'premium_plus_monthly' || planId === 'premium_plus_yearly')) {
      updateData.ai_provider = aiProvider;
    } else if (planId !== 'premium_plus' && planId !== 'premium_plus_monthly' && planId !== 'premium_plus_yearly') {
      // Premium Plus değilse AI provider'ı kaldır
      updateData.ai_provider = null;
    }

    // Teklifbul Rule v1.0 - undefined değerleri temizle
    const cleanUpdateData: any = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (value !== undefined) {
        cleanUpdateData[key] = value;
      }
    }

    // Firestore'da güncelle
    await db.collection('users').doc(uid).update(cleanUpdateData);

    // Subscription kaydı oluştur/güncelle (sadece premium planlar için)
    if (planId !== 'free') {
      // Teklifbul Rule v1.0 - undefined değerleri filtrele (Firestore undefined kabul etmez)
      const companyId = userData?.companyId || userData?.activeCompanyId || null;
      
      // Teklifbul Rule v1.0 - Subscription data oluştur (undefined değerler olmadan)
      const subscriptionData: any = {
        userId: uid,
        planId,
        planName: planId === 'premium_plus' ? 'Premium Plus' : 
                  planId === 'premium_plus_monthly' ? 'Premium Plus (Aylık)' : 
                  planId === 'premium_plus_yearly' ? 'Premium Plus (Yıllık)' :
                  planId === 'premium_monthly' ? 'Premium (Aylık)' :
                  planId === 'premium_yearly' ? 'Premium (Yıllık)' : planId,
        status: 'active' as const,
        billingInterval: planId.includes('yearly') ? 'yearly' as const : 'monthly' as const,
        cancelAtPeriodEnd: false,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      };
      
      // startedAt ekle (cleanUpdateData'da varsa, yoksa serverTimestamp)
      const startedAtValue = cleanUpdateData.subscriptionStartedAt;
      subscriptionData.startedAt = startedAtValue !== undefined ? startedAtValue : FieldValue.serverTimestamp();
      
      // currentPeriodEnd ekle (cleanUpdateData'da varsa, yoksa serverTimestamp)
      const expiresAtValue = cleanUpdateData.expiresAt;
      subscriptionData.currentPeriodEnd = expiresAtValue !== undefined ? expiresAtValue : FieldValue.serverTimestamp();
      
      // companyId varsa ekle, yoksa ekleme (undefined olmamalı)
      if (companyId) {
        subscriptionData.companyId = companyId;
      }

      // Teklifbul Rule v1.0 - undefined değerleri temizle (ek güvenlik)
      const cleanSubscriptionData: any = {};
      for (const [key, value] of Object.entries(subscriptionData)) {
        // undefined ve null değerleri filtrele (Firestore undefined kabul etmez)
        if (value !== undefined && value !== null) {
          cleanSubscriptionData[key] = value;
        }
      }
      
      // companyId özel kontrolü - undefined ise kesinlikle ekleme
      if (cleanSubscriptionData.companyId === undefined) {
        delete cleanSubscriptionData.companyId;
      }
      
      logger.info('Subscription data hazırlandı', { 
        hasCompanyId: !!cleanSubscriptionData.companyId,
        companyIdValue: cleanSubscriptionData.companyId,
        startedAt: cleanSubscriptionData.startedAt ? 'var' : 'yok',
        currentPeriodEnd: cleanSubscriptionData.currentPeriodEnd ? 'var' : 'yok',
        keys: Object.keys(cleanSubscriptionData)
      });

      // Mevcut subscription var mı kontrol et
      const existingSubs = await db.collection('subscriptions')
        .where('userId', '==', uid)
        .where('status', '==', 'active')
        .get();

      if (!existingSubs.empty) {
        // Mevcut subscription'ı güncelle
        // Teklifbul Rule v1.0 - Update işleminde companyId undefined olmamalı
        const existingSubData = existingSubs.docs[0].data();
        
        // companyId kontrolü: mevcut subscription'da varsa koru, yoksa ve yeni data'da varsa ekle
        const newCompanyId = cleanSubscriptionData.companyId;
        const existingCompanyId = existingSubData?.companyId;
        const finalCompanyId = (newCompanyId !== undefined && newCompanyId !== null) 
          ? newCompanyId 
          : (existingCompanyId !== undefined && existingCompanyId !== null) 
            ? existingCompanyId 
            : null;
        
        // Final clean data oluştur (companyId hariç, undefined değerler olmadan)
        const finalUpdateData: any = {};
        for (const [key, value] of Object.entries(cleanSubscriptionData)) {
          // companyId'yi atla, sonra ayrı ekleyeceğiz
          if (key === 'companyId') continue;
          if (value !== undefined && value !== null) {
            finalUpdateData[key] = value;
          }
        }
        
        // companyId ekle (sadece null değilse)
        if (finalCompanyId !== null && finalCompanyId !== undefined) {
          finalUpdateData.companyId = finalCompanyId;
        }
        
        // Son kontrol: companyId undefined ise kesinlikle ekleme
        if (finalUpdateData.hasOwnProperty('companyId') && finalUpdateData.companyId === undefined) {
          delete finalUpdateData.companyId;
        }
        
        logger.info('Subscription update data', { 
          hasCompanyId: !!finalUpdateData.companyId,
          companyIdValue: finalUpdateData.companyId,
          newCompanyId,
          existingCompanyId,
          finalCompanyId,
          keys: Object.keys(finalUpdateData)
        });
        
        await existingSubs.docs[0].ref.update(finalUpdateData);
      } else {
        // Yeni subscription oluştur
        // Final clean data oluştur (undefined değerler olmadan)
        const finalCreateData: any = {};
        for (const [key, value] of Object.entries(cleanSubscriptionData)) {
          if (value !== undefined && value !== null) {
            finalCreateData[key] = value;
          }
        }
        
        // companyId undefined ise kesinlikle ekleme
        if (finalCreateData.companyId === undefined) {
          delete finalCreateData.companyId;
        }
        
        logger.info('Subscription create data', { 
          hasCompanyId: !!finalCreateData.companyId,
          companyIdValue: finalCreateData.companyId,
          keys: Object.keys(finalCreateData)
        });
        
        await db.collection('subscriptions').add(finalCreateData);
      }
    } else {
      // Ücretsiz plana düşürülürse aktif subscription'ları iptal et
      const existingSubs = await db.collection('subscriptions')
        .where('userId', '==', uid)
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

    logger.info('Kullanıcı planı güncellendi', { 
      uid, 
      planId, 
      expiresAt: cleanUpdateData.expiresAt,
      startedAt: cleanUpdateData.subscriptionStartedAt,
      aiProvider: cleanUpdateData.ai_provider
    });
    
    // Teklifbul Rule v1.0 - Security: Admin aksiyonlarını logla
    serverLogger.security.adminAction(req, 'update_user_plan', uid);
    
    logger.end();
    
    // Güncellenmiş kullanıcı verilerini döndür
    const updatedUserDoc = await db.collection('users').doc(uid).get();
    const updatedUserData = updatedUserDoc.data();
    
    return res.json({ 
      ok: true, 
      uid, 
      planId, 
      expiresAt: cleanUpdateData.expiresAt?.toISOString?.() || cleanUpdateData.expiresAt,
      startedAt: cleanUpdateData.subscriptionStartedAt?.toISOString?.() || cleanUpdateData.subscriptionStartedAt,
      aiProvider: cleanUpdateData.ai_provider,
      isPremium: cleanUpdateData.isPremium,
      message: 'Kullanıcı planı başarıyla güncellendi',
      user: {
        uid,
        ...updatedUserData,
        expiresAt: updatedUserData?.expiresAt?.toDate?.()?.toISOString(),
        subscriptionStartedAt: updatedUserData?.subscriptionStartedAt?.toDate?.()?.toISOString(),
      }
    });
  } catch (error: any) {
    logger.error('Kullanıcı plan güncelleme hatası', error);
    logger.end();
    return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
  }
});

/**
 * Tek kullanıcı detayı - GET /api/admin/users/:id
 */
// Teklifbul Rule v1.0 - Input Validation Schema for get by id
const getUserByIdParamsSchema = z.object({
  id: z.string().min(1),
});

router.get('/users/:id',
  validateRequest({ params: getUserByIdParamsSchema }),
  async (req: AuthenticatedRequest, res) => {
  logger.group('admin-users:get');
  try {
    const { id } = req.params;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const userDoc = await db.collection('users').doc(id).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
    }

    const userData = userDoc.data();
    
    // PERFORMANS: Firebase Auth kontrolü opsiyonel - varsayılan olarak atla
    // Gerekirse query parametresi ile açılabilir: ?checkAuth=true
    const checkAuth = req.query.checkAuth === 'true';
    let email = userData?.email || userData?.contactEmails?.[0];
    let emailVerified = userData?.emailVerified || false;
    
    // Sadece checkAuth=true ise Firebase Auth'dan kontrol et
    if (checkAuth) {
      try {
        const authUser = await admin.auth().getUser(userDoc.id);
        if (authUser.email) {
          email = authUser.email;
          emailVerified = authUser.emailVerified || emailVerified;
        }
      } catch (authError) {
        // Firebase Auth'da kullanıcı yoksa Firestore'dan devam et
        logger.warn('Firebase Auth user not found', { uid: userDoc.id });
      }
    }
    
    // Teklifbul Rule v1.0 - Şirket planına göre kullanıcı planını güncelle (UI senkronizasyonu)
    let planId = userData?.planId || 'free';
    let isPremium = userData?.isPremium === true;
    let expiresAt = userData?.expiresAt;
    
    const companyId = userData?.companyId || userData?.activeCompanyId;
    if (companyId) {
      try {
        const compDoc = await db.collection('companies').doc(companyId).get();
        if (compDoc.exists) {
          const compData = compDoc.data();
          const compPlan = compData?.planId || compData?.plan || compData?.subscriptionPlanId || compData?.subscription?.planId || 'free';
          
          if (compPlan !== 'free' && compPlan !== '') {
            planId = compPlan;
            isPremium = true;
            expiresAt = compData?.premiumExpiresAt || compData?.expiresAt || compData?.subscription?.expiresAt || expiresAt;
          }
        }
      } catch (err) {
        logger.warn('Sirket bilgileri alinamadi (tekil kullanici detayi icin)', err);
      }
    }

    const user = {
      uid: userDoc.id,
      ...userData,
      email: email,
      emailVerified: emailVerified,
      planId: planId,
      isPremium: isPremium,
      createdAt: userData?.createdAt?.toDate?.()?.toISOString(),
      updatedAt: userData?.updatedAt?.toDate?.()?.toISOString(),
      expiresAt: expiresAt?.toDate?.()?.toISOString() || (expiresAt instanceof Date ? expiresAt.toISOString() : (typeof expiresAt === 'number' || typeof expiresAt === 'string' ? new Date(expiresAt).toISOString() : null)),
      subscriptionStartedAt: userData?.subscriptionStartedAt?.toDate?.()?.toISOString(),
    };

    logger.info('Kullanıcı detayı alındı', { uid: id });
    logger.end();
    return res.json(user);
  } catch (error: any) {
    logger.error('Kullanıcı detayı hatası', error);
    logger.end();
    return res.status(500).json({ error: 'GET_ERROR', message: error.message });
  }
});

/**
 * Kullanıcı güncelle - PUT /api/admin/users/:id
 */
router.put('/users/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-users:update');
  try {
    const { id } = req.params;
    const { displayName, companyName, taxId, isActive, emailVerified, companyJoinCode } = req.body;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const userDoc = await db.collection('users').doc(id).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
    }

    const userData = userDoc.data();
    const currentTaxNumber = userData?.taxNumber || userData?.taxId || null;
    const currentCompanyId = userData?.companyId || null;

    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp()
    };

    if (displayName !== undefined) updateData.displayName = displayName;
    if (companyName !== undefined) updateData.companyName = companyName;
    
    // Teklifbul Rule v1.0 - Admin vergi numarası değiştirme kontrolü
    if (taxId !== undefined && taxId !== null && taxId.trim() !== '') {
      const newTaxNumber = taxId.trim();
      
      // Vergi numarası değişti mi kontrol et
      if (currentTaxNumber && currentTaxNumber.trim() !== newTaxNumber) {
        // Yeni vergi numarasına ait şirket var mı kontrol et
        const newCompanyId = `tax-${newTaxNumber}`;
        const companyDoc = await db.collection('companies').doc(newCompanyId).get();
        
        if (companyDoc.exists) {
          // Şirket varsa, companyJoinRequests'e ekle
          const companyData = companyDoc.data();
          const companyCode = companyData?.code || '';
          
          // Mevcut pending request var mı kontrol et
          const existingRequests = await db.collection('companyJoinRequests')
            .where('userId', '==', id)
            .where('companyId', '==', newCompanyId)
            .where('status', '==', 'pending')
            .limit(1)
            .get();
          
          if (existingRequests.empty) {
            // Yeni request oluştur
            await db.collection('companyJoinRequests').add({
              userId: id,
              userEmail: userData?.email || userData?.contactEmails?.[0] || '',
              companyCode: companyCode,
              companyId: newCompanyId,
              requestedRole: userData?.requestedRole || 'buyer',
              requestedCompanyRole: userData?.requestedCompanyRole || userData?.roleKey || '',
              status: 'pending',
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              adminChangedTaxNumber: true, // Admin tarafından değiştirildi işareti
              previousTaxNumber: currentTaxNumber,
              previousCompanyId: currentCompanyId
            });
            
            logger.info('Admin vergi numarası değişikliği - companyJoinRequest oluşturuldu', {
              userId: id,
              newTaxNumber,
              newCompanyId,
              companyCode
            });
          }
          
          // Vergi numarasını güncelle ama companyId'yi değiştirme (onay bekliyor)
          updateData.taxNumber = newTaxNumber;
          updateData.taxId = newTaxNumber;
        } else {
          // Şirket yoksa direkt güncelle
          updateData.taxNumber = newTaxNumber;
          updateData.taxId = newTaxNumber;
        }
      } else {
        // Aynı vergi numarası, direkt güncelle
        updateData.taxNumber = newTaxNumber;
        updateData.taxId = newTaxNumber;
      }
    } else if (taxId === null || taxId === '') {
      // Vergi numarası siliniyorsa
      updateData.taxNumber = null;
      updateData.taxId = null;
    }
    
    // Teklifbul Rule v1.x - Admin tarafından Şirket Kodu girilmesi
    if (companyJoinCode !== undefined && companyJoinCode !== null && companyJoinCode.trim() !== '') {
      const codeStr = companyJoinCode.trim().toUpperCase();
      const codeCompanyQuery = await db.collection('companies').where('code', '==', codeStr).limit(1).get();
      
      if (!codeCompanyQuery.empty) {
        const companyDoc = codeCompanyQuery.docs[0];
        const newCompanyId = companyDoc.id;
        const companyData = companyDoc.data();
        const employerId = companyData?.ownerId;
        
        // Mevcut pending request var mı kontrol et
        const existingCodeRequests = await db.collection('companyJoinRequests')
          .where('userId', '==', id)
          .where('companyId', '==', newCompanyId)
          .where('status', '==', 'pending')
          .limit(1)
          .get();
          
        if (existingCodeRequests.empty) {
          // Yeni request oluştur
          await db.collection('companyJoinRequests').add({
            userId: id,
            userEmail: userData?.email || userData?.contactEmails?.[0] || '',
            companyCode: codeStr,
            companyId: newCompanyId,
            requestedRole: userData?.requestedRole || 'buyer',
            requestedCompanyRole: userData?.requestedCompanyRole || userData?.roleKey || '',
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            adminChangedJoinCode: true,
            previousCompanyId: currentCompanyId
          });
          
          await db.collection('companies').doc(newCompanyId).collection('pendingMembers').doc(id).set({
            userId: id,
            userEmail: userData?.email || userData?.contactEmails?.[0] || '',
            requestedRole: userData?.requestedCompanyRole || 'buyer',
            requestedAt: FieldValue.serverTimestamp(),
            status: 'pending'
          });
          
          // HEM şirketin alt tablosuna HEM global tabloya bildirim atılıyor! (Böylece header zili algılayacak)
          const notificationPayload = {
            type: 'pending_member_request',
            userId: employerId || 'SYSTEM',
            userEmail: userData?.email || userData?.contactEmails?.[0] || '',
            message: `${userData?.email || userData?.name || 'Bir kullanıcı'} şirketinize katılmak için onay bekliyor.`,
            createdAt: FieldValue.serverTimestamp(),
            read: false
          };
          
          // Şirket içi lokal bildirim dizini (eski sistemler kullanıyorsa diye geriye dönük uyumluluk)
          await db.collection('companies').doc(newCompanyId).collection('notifications').add(notificationPayload);
          
          // Global bildirim dizini (Zilin çalıştığı asıl yer)
          if (employerId) {
             await db.collection('notifications').add(notificationPayload);
          }
          
          logger.info('Admin şirket kodu eklentisi - companyJoinRequest oluşturuldu', {
            userId: id,
            newCompanyId,
            companyCode: codeStr,
            employerId
          });
        }
        
        updateData.companyJoinStatus = 'pending';
        updateData.requestedCompanyId = newCompanyId;
        updateData.companyCode = codeStr;
      }
    }
    
    if (isActive !== undefined) {
      updateData.isActive = isActive;
      updateData.status = isActive ? 'active' : 'inactive';
      
      try {
        await admin.auth().updateUser(id, {
          disabled: !isActive
        });
        logger.info('Firebase Auth disabled durumu güncellendi', { uid: id, disabled: !isActive });
      } catch (authError: any) {
        logger.warn('Firebase Auth disabled güncellenemedi', { uid: id, error: authError.message });
      }
    }
    let authUpdateSuccess = true;
    if (emailVerified !== undefined) {
      updateData.emailVerified = emailVerified;
      // Firebase Auth'da da emailVerified güncelle
      try {
        await admin.auth().updateUser(id, {
          emailVerified: emailVerified
        });
        logger.info('Firebase Auth emailVerified güncellendi', { uid: id, emailVerified });
        authUpdateSuccess = true;
      } catch (authError: any) {
        logger.warn('Firebase Auth emailVerified güncellenemedi', { uid: id, error: authError.message });
        authUpdateSuccess = false;
        // Firestore güncellemesi devam eder
      }
    }

    await db.collection('users').doc(id).update(updateData);

    // Teklifbul Rule v1.0 - Security: Admin aksiyonlarını logla
    serverLogger.security.adminAction(req, 'update_user', id);

    logger.info('Kullanıcı güncellendi', { uid: id, updates: Object.keys(updateData) });
    logger.end();
    return res.json({ 
      ok: true, 
      uid: id, 
      ...updateData,
      // Teklifbul Rule v1.0 - Firebase Auth güncelleme durumunu bildir
      authUpdateSuccess: emailVerified !== undefined ? authUpdateSuccess : undefined
    });
  } catch (error: any) {
    logger.error('Kullanıcı güncelleme hatası', error);
    logger.end();
    return res.status(500).json({ error: 'UPDATE_ERROR', message: error.message });
  }
});

/**
 * Kullanıcı sil - DELETE /api/admin/users/:id
 */
router.delete('/users/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-users:delete');
  try {
    const { id } = req.params;

    const db = await getAdminDb();
    if (!db) {
      return res.status(500).json({ error: 'DB_UNAVAILABLE', message: 'Veritabanı bağlantısı kurulamadı' });
    }

    const userDoc = await db.collection('users').doc(id).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı' });
    }

    const userData = userDoc.data();
    
    // Teklifbul Rule v1.0 - Security: Admin aksiyonlarını logla
    serverLogger.security.adminAction(req, 'delete_user', id);

    // Firestore'dan kullanıcıyı sil
    await db.collection('users').doc(id).delete();

    // Firebase Auth'dan da sil (opsiyonel - dikkatli olunmalı)
    try {
      await admin.auth().deleteUser(id);
      logger.info('Firebase Auth kullanıcısı silindi', { uid: id });
    } catch (authError: any) {
      logger.warn('Firebase Auth kullanıcısı silinemedi', { uid: id, error: authError.message });
      // Firestore silme işlemi başarılı olduğu için devam ediyoruz
    }

    // İlişkili verileri de temizle (opsiyonel - şirket, teklifler vb.)
    // Burada cascade delete yapılabilir

    logger.info('Kullanıcı silindi', { uid: id, email: userData?.email });
    logger.end();
    return res.json({ ok: true, uid: id, message: 'Kullanıcı başarıyla silindi' });
  } catch (error: any) {
    logger.error('Kullanıcı silme hatası', error);
    logger.end();
    return res.status(500).json({ error: 'DELETE_ERROR', message: error.message });
  }
});

// Duplicate route kaldırıldı - yukarıdaki gelişmiş versiyon kullanılıyor (166. satır)

export default router;

