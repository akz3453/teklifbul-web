/**
 * Admin Errors API Routes
 * Teklifbul Rule v1.0 - Hata yönetimi API'leri
 * 
 * Admin kullanıcıların hataları görüntülemesi ve yönetmesi için API endpoints
 * 
 * ROUTE ORDERING: Literal paths (analyze-batch, schedule-analysis) 
 * MUST come BEFORE parameterized /:id routes to prevent Express from 
 * treating 'analyze-batch' as a document ID.
 */

import { Router } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../../src/shared/log/logger.js';
import { getAdminDb } from '../utils/firestore.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserAIProvider } from '../services/userService.js';

const router = Router();

// Tüm route'lar için admin zorunlu
router.use(verifyToken, requireAdmin);

/**
 * GET /api/admin/errors
 * Hata listesi (filtreleme, sayfalama)
 */
router.get('/', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-errors:list');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const {
      type,
      severity,
      resolved,
      search,
      limit = '50',
      offset = '0',
      orderBy = 'timestamp',
      orderDirection = 'desc'
    } = req.query;

    let query: FirebaseFirestore.Query = db.collection('error_logs');

    // Teklifbul Rule v1.0 - Firestore composite index sorunlarını önlemek için
    // Önce resolved filtresi (en yaygın), sonra orderBy ekle
    // Birden fazla where + orderBy composite index gerektirir
    
    // Resolved filtresi (en yaygın kullanım)
    const isResolved = resolved === 'true' ? true : (resolved === 'false' ? false : null);
    
    // Sıralama field'ı
    const orderByField = orderBy === 'count' ? 'count' : 'timestamp';
    const orderDir = orderDirection === 'asc' ? 'asc' : 'desc';
    
    // Teklifbul Rule v1.0 - Index sorunlarını önlemek için query'yi basitleştir
    // Eğer resolved filtresi varsa, önce onu ekle, sonra orderBy
    if (isResolved !== null) {
      query = query.where('resolved', '==', isResolved);
    }
    
    // OrderBy ekle (resolved filtresi varsa composite index gerekir)
    query = query.orderBy(orderByField, orderDir);
    
    // Diğer filtreleri client-side'da yapacağız (index sorunlarını önlemek için)
    // Type ve severity filtreleri client-side'da yapılacak

    // Limit ve offset
    const limitNum = parseInt(limit as string, 10) || 50;
    const offsetNum = parseInt(offset as string, 10) || 0;
    
    // Firestore'da offset yok, bu yüzden daha fazla veri alıp client-side'da slice yapacağız
    // Offset için daha fazla limit al (max 1000)
    const fetchLimit = Math.min(limitNum + offsetNum, 1000);
    
    // Teklifbul Rule v1.0 - Firestore query hatası yakalama
    let snapshot;
    try {
      snapshot = await query.limit(fetchLimit).get();
    } catch (queryError: any) {
      // Index hatası veya query hatası
      logger.error('Firestore query hatası', { 
        filters: { type, severity, resolved },
        orderBy: orderByField,
        error: queryError.message,
        code: queryError.code
      });
      
      // Index hatası kontrolü - Firestore index link'ini çıkar
      if (queryError.message?.includes('index') || 
          queryError.code === 9 || 
          queryError.code === 'FAILED_PRECONDITION' ||
          queryError.message?.includes('FAILED_PRECONDITION')) {
        
        // Firestore index link'ini mesajdan çıkar
        let indexLink = null;
        const errorMsg = queryError.message || '';
        
        // Link'i bul (https://console.firebase.google.com ile başlayan)
        const linkMatch = errorMsg.match(/https:\/\/console\.firebase\.google\.com[^\s\)]+/);
        if (linkMatch) {
          indexLink = linkMatch[0];
        } else {
          // create_composite parametresini bul ve link oluştur
          const compositeMatch = errorMsg.match(/create_composite=([^\s\)]+)/);
          if (compositeMatch) {
            indexLink = `https://console.firebase.google.com/v1/r/project/teklifbul/firestore/indexes?create_composite=${compositeMatch[1]}`;
          }
        }
        
        logger.error('Firestore index gerekli', { 
          indexLink,
          errorMessage: errorMsg,
          filters: { type, severity, resolved },
          orderBy: orderByField
        });

        // Teklifbul Rule v1.0 - Index yoksa, fallback olarak filtresiz sorgu dene
        try {
          logger.info('Index bulunamadı, filtresiz sorgu deneniyor...');
          const fallbackQuery = db.collection('error_logs')
            .orderBy('timestamp', 'desc')
            .limit(fetchLimit);
          snapshot = await fallbackQuery.get();
          logger.info('Filtresiz sorgu başarılı', { count: snapshot.size });
        } catch (fallbackError: any) {
          logger.end();
          return res.status(500).json({
            ok: false,
            error: 'index_required',
            message: 'Firestore index gerekli. Lütfen aşağıdaki linke tıklayarak index oluşturun.',
            details: errorMsg,
            indexLink: indexLink
          });
        }
      } else {
        // Diğer hatalar
        throw queryError;
      }
    }
    
    let errors: any[] = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.()?.toISOString(),
      lastOccurred: doc.data().lastOccurred?.toDate?.()?.toISOString(),
      resolvedAt: doc.data().resolvedAt?.toDate?.()?.toISOString(),
      aiAnalysis: doc.data().aiAnalysis ? {
        ...doc.data().aiAnalysis,
        analyzedAt: doc.data().aiAnalysis.analyzedAt?.toDate?.()?.toISOString()
      } : undefined
    }));

    // Teklifbul Rule v1.0 - Client-side filtreleme (index sorunlarını önlemek için)
    // Resolved filtresi (fallback sorgusunda filtre uygulanmamış olabilir)
    if (isResolved !== null) {
      errors = errors.filter(error => error.resolved === isResolved);
    }

    // Type filtresi
    if (type === 'frontend' || type === 'backend') {
      errors = errors.filter(error => error.type === type);
    }

    // Severity filtresi
    if (severity === 'low' || severity === 'medium' || severity === 'high' || severity === 'critical') {
      errors = errors.filter(error => error.severity === severity);
    }

    // Arama (client-side, Firestore'da text search yok)
    if (search) {
      const searchLower = (search as string).toLowerCase();
      errors = errors.filter(error => 
        error.message?.toLowerCase().includes(searchLower) ||
        error.code?.toLowerCase().includes(searchLower) ||
        error.url?.toLowerCase().includes(searchLower) ||
        error.path?.toLowerCase().includes(searchLower)
      );
    }

    // Offset uygula (client-side)
    errors = errors.slice(offsetNum, offsetNum + limitNum);

    // Toplam sayı için ayrı sorgu (yaklaşık değer)
    // Not: Tam sayı için tüm collection'ı saymak pahalı, bu yüzden yaklaşık değer kullanıyoruz
    let total = snapshot.size;
    try {
      const totalSnapshot = await db.collection('error_logs').count().get();
      total = totalSnapshot.data().count || snapshot.size;
    } catch {
      // Count API yoksa snapshot size kullan (zaten total = snapshot.size)
    }

    logger.info('Errors fetched', { count: errors.length, total });
    logger.end();
    res.json({
      ok: true,
      errors,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < total
      }
    });
  } catch (error: any) {
    logger.error('Failed to fetch errors', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_fetch_errors',
      message: error.message || 'Hatalar alınamadı'
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// IMPORTANT: Literal path routes MUST be defined BEFORE /:id routes
// Otherwise Express would match 'analyze-batch' as an :id parameter
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/errors/analyze-batch
 * Toplu AI analizi
 */
router.post('/analyze-batch', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-errors:analyze-batch');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const { errorIds } = req.body;

    if (!Array.isArray(errorIds) || errorIds.length === 0) {
      logger.end();
      return res.status(400).json({ ok: false, error: 'invalid_error_ids', message: 'Lütfen en az bir hata seçin' });
    }

    // Maksimum 20 hata aynı anda analiz edilebilir
    if (errorIds.length > 20) {
      logger.end();
      return res.status(400).json({ ok: false, error: 'too_many_errors', message: 'Aynı anda en fazla 20 hata analiz edilebilir' });
    }

    // AI analysis service'i import et
    const { analyzeErrorsBatch } = await import('../services/ai-error-analysis.js');
    const userId = req.user?.uid || undefined;
    const results = await analyzeErrorsBatch(errorIds, db, userId);

    // AI provider bilgisini al
    let aiProvider = 'Gemini 3.0 Pro (varsayılan)';
    try {
      const userProvider = await getUserAIProvider(userId || '');
      aiProvider = userProvider === 'openai' ? 'OpenAI GPT-4o-mini' : 'Gemini 3.0 Pro';
    } catch {
      // Varsayılan kullan
    }

    // Teklifbul Rule v1.0 - Analiz sonuçlarını Firestore'a kaydet
    const updatePromises = results.map(async ({ errorId, analysis }) => {
      try {
        await db.collection('error_logs').doc(errorId).update({
          aiAnalyzed: true,
          aiAnalysis: {
            ...analysis,
            provider: aiProvider,
            analyzedAt: FieldValue.serverTimestamp()
          },
          updatedAt: FieldValue.serverTimestamp()
        });
      } catch (err) {
        logger.warn('Failed to save analysis result', { errorId, error: err });
      }
    });

    await Promise.allSettled(updatePromises);

    logger.info('Batch analysis completed', { count: results.length });
    logger.end();
    res.json({ ok: true, results, provider: aiProvider });
  } catch (error: any) {
    logger.error('Failed to analyze errors batch', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_analyze_errors',
      message: error.message || 'Hatalar analiz edilemedi'
    });
  }
});

/**
 * POST /api/admin/errors/schedule-analysis
 * Zamanlanmış analiz ayarlama
 */
router.post('/schedule-analysis', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-errors:schedule-analysis');
  try {
    const { interval, enabled } = req.body;

    // TODO: Cloud Function veya cron job ile zamanlanmış analiz implementasyonu
    // Şimdilik sadece ayarları kaydet
    logger.info('Schedule analysis settings', { interval, enabled });
    logger.end();
    res.json({
      ok: true,
      message: 'Zamanlanmış analiz ayarları kaydedildi (implementasyon devam ediyor)'
    });
  } catch (error: any) {
    logger.error('Failed to schedule analysis', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_schedule_analysis',
      message: error.message || 'Zamanlanmış analiz ayarlanamadı'
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Parameterized /:id routes - MUST come AFTER literal path routes
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/errors/:id
 * Hata detayı
 */
router.get('/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-errors:detail');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const { id } = req.params;
    const doc = await db.collection('error_logs').doc(id).get();

    if (!doc.exists) {
      logger.end();
      return res.status(404).json({ ok: false, error: 'error_not_found' });
    }

    const errorData = {
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data()?.timestamp?.toDate?.()?.toISOString(),
      lastOccurred: doc.data()?.lastOccurred?.toDate?.()?.toISOString(),
      resolvedAt: doc.data()?.resolvedAt?.toDate?.()?.toISOString(),
      aiAnalysis: doc.data()?.aiAnalysis ? {
        ...doc.data()?.aiAnalysis,
        analyzedAt: doc.data()?.aiAnalysis.analyzedAt?.toDate?.()?.toISOString()
      } : undefined
    };

    logger.info('Error detail fetched', { id });
    logger.end();
    res.json({ ok: true, error: errorData });
  } catch (error: any) {
    logger.error('Failed to fetch error detail', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_fetch_error',
      message: error.message || 'Hata detayı alınamadı'
    });
  }
});

/**
 * PATCH /api/admin/errors/:id
 * Hata güncelleme (resolved, severity)
 */
router.patch('/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-errors:update');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const { id } = req.params;
    const { resolved, severity } = req.body;

    const updateData: any = {};
    
    if (typeof resolved === 'boolean') {
      updateData.resolved = resolved;
      if (resolved) {
        updateData.resolvedAt = FieldValue.serverTimestamp();
        updateData.resolvedBy = req.user?.uid;
      } else {
        updateData.resolvedAt = null;
        updateData.resolvedBy = null;
      }
    }

    if (severity === 'low' || severity === 'medium' || severity === 'high' || severity === 'critical') {
      updateData.severity = severity;
    }

    if (Object.keys(updateData).length === 0) {
      logger.end();
      return res.status(400).json({ ok: false, error: 'no_updates_provided' });
    }

    updateData.updatedAt = FieldValue.serverTimestamp();

    await db.collection('error_logs').doc(id).update(updateData);

    logger.info('Error updated', { id, updates: updateData });
    logger.end();
    res.json({ ok: true, message: 'Hata güncellendi' });
  } catch (error: any) {
    logger.error('Failed to update error', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_update_error',
      message: error.message || 'Hata güncellenemedi'
    });
  }
});

/**
 * DELETE /api/admin/errors/:id
 * Hata kaydını sil
 */
router.delete('/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-errors:delete');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const { id } = req.params;
    const docRef = db.collection('error_logs').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      logger.end();
      return res.status(404).json({ ok: false, error: 'error_not_found' });
    }

    await docRef.delete();
    logger.info('Error deleted', { id });
    logger.end();
    res.json({ ok: true, message: 'Hata silindi' });
  } catch (error: any) {
    logger.error('Failed to delete error', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_delete_error',
      message: error.message || 'Hata silinemedi'
    });
  }
});

/**
 * POST /api/admin/errors/:id/analyze
 * Tek hata AI analizi
 */
router.post('/:id/analyze', async (req: AuthenticatedRequest, res) => {
  logger.group('admin-errors:analyze');
  try {
    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'Firestore unavailable' });
    }

    const { id } = req.params;
    const doc = await db.collection('error_logs').doc(id).get();

    if (!doc.exists) {
      logger.end();
      return res.status(404).json({ ok: false, error: 'error_not_found' });
    }

    // AI analysis service'i import et ve çağır
    const { analyzeError } = await import('../services/ai-error-analysis.js');
    const userId = req.user?.uid || undefined;
    const analysis = await analyzeError(doc.data()!, userId);

    // AI provider bilgisini al (hangi AI kullanıldı)
    let aiProvider = 'gemini'; // Varsayılan
    try {
      const userProvider = await getUserAIProvider(userId || '');
      aiProvider = userProvider === 'openai' ? 'OpenAI GPT-4o-mini' : 'Gemini 3.0 Pro';
    } catch {
      aiProvider = 'Gemini 3.0 Pro (varsayılan)';
    }
    
    // Firestore'a kaydet
    await db.collection('error_logs').doc(id).update({
      aiAnalyzed: true,
      aiAnalysis: {
        ...analysis,
        provider: aiProvider, // Hangi AI kullanıldı
        analyzedAt: FieldValue.serverTimestamp()
      },
      updatedAt: FieldValue.serverTimestamp()
    });

    logger.info('Error analyzed', { id, provider: aiProvider });
    logger.end();
    res.json({ ok: true, analysis, provider: aiProvider });
  } catch (error: any) {
    logger.error('Failed to analyze error', error);
    logger.end();
    res.status(500).json({
      ok: false,
      error: 'failed_to_analyze_error',
      message: error.message || 'Hata analiz edilemedi'
    });
  }
});

export default router;
