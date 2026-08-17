/**
 * Upgrade Leads Routes
 * Teklifbul Rule v1.8 - Upgrade Leads + Plan Comparison Table (No Payment)
 * 
 * POST /api/leads/upgrade
 */

import { Router } from 'express';
import { AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { getCompanyIdFromRequest } from '../src/services/permissionService.js';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';

const router = Router();

const upgradeLeadSchema = z.object({
  contactEmail: z.string().email('Geçerli bir e-posta adresi giriniz'),
  contactName: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  source: z.string().default('billing-plan'),
});

/**
 * POST /api/leads/upgrade
 * Creates an upgrade lead for a company
 */
router.post('/upgrade', verifyToken, async (req: AuthenticatedRequest, res) => {
  try {
    logger.group('Upgrade Lead API');
    
    const userId = req.user?.uid;
    if (!userId) {
      logger.warn('User ID missing');
      logger.end();
      return res.status(401).json({
        error: 'auth_required',
        message: 'Bu işlem için giriş yapmalısınız.'
      });
    }

    // Get company ID — trusted membership (pending / spoof yok)
    const companyId = await getCompanyIdFromRequest(req);

    if (!companyId) {
      logger.warn('Company ID not found', { userId });
      logger.end();
      return res.status(400).json({
        error: 'company_not_found',
        message: 'Şirket bilgisi bulunamadı.'
      });
    }

    // Validate request body
    const validationResult = upgradeLeadSchema.safeParse(req.body);
    if (!validationResult.success) {
      logger.warn('Invalid request body', validationResult.error);
      logger.end();
      return res.status(400).json({
        error: 'validation_error',
        message: validationResult.error.errors[0]?.message || 'Geçersiz istek',
        details: validationResult.error.errors,
      });
    }

    const { contactEmail, contactName, note, reason, source } = validationResult.data;

    const db = await getAdminDb();
    if (!db) {
      logger.error('Database connection failed');
      logger.end();
      return res.status(500).json({
        error: 'database_error',
        message: 'Veritabanı bağlantısı kurulamadı.'
      });
    }

    // Create lead document
    const leadRef = db
      .collection('companies')
      .doc(companyId)
      .collection('upgradeLeads')
      .doc();

    await leadRef.set({
      contactEmail,
      contactName: contactName || null,
      note: note || null,
      reason: reason || null,
      source: source || 'billing-plan',
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      createdBy: userId,
    });

    logger.info('Upgrade lead created', {
      companyId,
      leadId: leadRef.id,
      contactEmail,
      reason,
    });
    logger.end();

    return res.json({
      success: true,
      leadId: leadRef.id,
      message: 'Kayıt başarıyla oluşturuldu.',
    });
  } catch (error: any) {
    logger.error('Error in upgrade lead endpoint', error);
    logger.end();
    return res.status(500).json({
      error: 'server_error',
      message: error.message || 'Sunucu hatası oluştu.',
    });
  }
});

export default router;

