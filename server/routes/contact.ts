/**
 * Contact form — public submit + admin list
 * Teklifbul Rule v1.0
 *
 * POST /api/contact
 * GET  /api/admin/contact-messages
 * PATCH /api/admin/contact-messages/:id
 */

import { Router } from 'express';
import { z } from 'zod';
import { FieldValue, type Firestore, type Query } from 'firebase-admin/firestore';
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
import { type AuthenticatedRequest } from '../middleware/auth.js';
import { isAdminUser } from '../auth/admin-check.js';
import { publicTokenLimiter } from '../middleware/rate-limit.js';

const CONTACT_COLLECTION = 'contactMessages';

const contactSchema = z.object({
  name: z.string().trim().min(2, 'İsim en az 2 karakter olmalı').max(120),
  company: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email('Geçerli bir e-posta giriniz').max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  message: z.string().trim().min(5, 'Mesaj en az 5 karakter olmalı').max(4000),
  website: z.string().trim().max(200).optional().nullable(),
});

async function resolveAdminUids(db: Firestore): Promise<string[]> {
  const uids = new Set<string>();

  try {
    const byFlag = await db.collection('users').where('isAdmin', '==', true).limit(50).get();
    byFlag.docs.forEach((d) => uids.add(d.id));
  } catch (e) {
    logger.warn('Admin uid sorgusu (isAdmin) başarısız', e);
  }

  try {
    const byRole = await db.collection('users').where('role', '==', 'admin').limit(50).get();
    byRole.docs.forEach((d) => uids.add(d.id));
  } catch (e) {
    logger.warn('Admin uid sorgusu (role) başarısız', e);
  }

  const emails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  for (const email of emails) {
    try {
      const snap = await db.collection('users').where('email', '==', email).limit(5).get();
      snap.docs.forEach((d) => uids.add(d.id));
    } catch (e) {
      logger.warn('Admin uid sorgusu (email) başarısız', { email, error: (e as Error)?.message });
    }
  }

  return [...uids];
}

async function notifyAdmins(db: Firestore, messageId: string, payload: {
  name: string;
  email: string;
  message: string;
}) {
  const adminUids = await resolveAdminUids(db);
  if (!adminUids.length) {
    logger.warn('İletişim mesajı için admin bulunamadı — bildirim atlandı', { messageId });
    return;
  }

  const preview = payload.message.length > 120
    ? `${payload.message.slice(0, 117)}...`
    : payload.message;

  const writes = adminUids.map((uid) =>
    db.collection('notifications').add({
      userId: uid,
      type: 'contact_message',
      title: 'Yeni iletişim mesajı',
      body: `${payload.name} (${payload.email}): ${preview}`,
      read: false,
      link: '/pages/admin/dashboard.html#contact-messages',
      data: {
        messageId,
        source: 'contact_form',
      },
      createdAt: FieldValue.serverTimestamp(),
    }).catch((err) => {
      logger.warn('Admin bildirim yazılamadı', { uid, error: (err as Error)?.message });
    })
  );

  await Promise.all(writes);
  logger.info('Admin iletişim bildirimleri oluşturuldu', { messageId, adminCount: adminUids.length });
}

/** Public contact form router */
export const contactPublicRouter = Router();

contactPublicRouter.post('/', publicTokenLimiter, async (req, res) => {
  logger.group('Contact Form Submit');
  try {
    const parsed = contactSchema.safeParse(req.body || {});
    if (!parsed.success) {
      logger.warn('Contact validation failed', parsed.error.flatten());
      logger.end();
      return res.status(400).json({
        ok: false,
        error: 'validation_error',
        message: parsed.error.errors[0]?.message || 'Geçersiz form',
      });
    }

    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'db_unavailable', message: 'Kayıt şu an alınamıyor.' });
    }

    const { name, company, email, phone, message, website } = parsed.data;
    if (website) {
      logger.warn('Contact honeypot triggered');
      logger.end();
      return res.json({
        ok: true,
        message: 'Mesajınız alındı. En kısa sürede dönüş yapacağız.',
      });
    }
    const docRef = await db.collection(CONTACT_COLLECTION).add({
      name,
      company: company || null,
      email: email.toLowerCase(),
      phone: phone || null,
      message,
      status: 'new',
      source: 'contact.html',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
      ip: String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 80) || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      await notifyAdmins(db, docRef.id, { name, email, message });
    } catch (notifyErr) {
      logger.warn('Admin bildirim hatası (mesaj kaydedildi)', notifyErr);
    }

    logger.info('Contact message saved', { id: docRef.id, email });
    logger.end();
    return res.json({
      ok: true,
      id: docRef.id,
      message: 'Mesajınız alındı. En kısa sürede dönüş yapacağız.',
    });
  } catch (error: any) {
    logger.error('Contact submit failed', error);
    logger.end();
    return res.status(500).json({
      ok: false,
      error: 'contact_submit_failed',
      message: 'Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin.',
    });
  }
});

/** Admin contact messages router (mounted under /api/admin with requireAdmin) */
export const contactAdminRouter = Router();

contactAdminRouter.get('/contact-messages', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin Contact Messages List');
  try {
    if (!isAdminUser(req.user)) {
      logger.end();
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'db_unavailable' });
    }

    const status = String(req.query.status || 'all');
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
    const search = String(req.query.search || '').trim().toLowerCase();

    let queryRef: Query = db.collection(CONTACT_COLLECTION).orderBy('createdAt', 'desc').limit(limit);
    if (status !== 'all') {
      queryRef = db.collection(CONTACT_COLLECTION).where('status', '==', status).orderBy('createdAt', 'desc').limit(limit);
    }

    let snap;
    try {
      snap = await queryRef.get();
    } catch (indexErr: any) {
      logger.warn('Contact messages indexed query failed, fallback', indexErr?.message);
      const fallback = await db.collection(CONTACT_COLLECTION).limit(limit).get();
      snap = fallback;
    }

    let messages = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        name: data.name || '',
        company: data.company || null,
        email: data.email || '',
        phone: data.phone || null,
        message: data.message || '',
        status: data.status || 'new',
        source: data.source || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null,
        adminNote: data.adminNote || null,
      };
    });

    messages.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

    if (search) {
      messages = messages.filter((m) =>
        [m.name, m.email, m.company, m.phone, m.message]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search))
      );
    }

    const unreadCount = messages.filter((m) => m.status === 'new').length;

    logger.info('Contact messages listed', { count: messages.length, unreadCount });
    logger.end();
    return res.json({ ok: true, messages, unreadCount, total: messages.length });
  } catch (error: any) {
    logger.error('Contact messages list failed', error);
    logger.end();
    return res.status(500).json({
      ok: false,
      error: 'list_failed',
      message: error?.message || 'Mesajlar yüklenemedi',
    });
  }
});

contactAdminRouter.patch('/contact-messages/:id', async (req: AuthenticatedRequest, res) => {
  logger.group('Admin Contact Message Update');
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      logger.end();
      return res.status(400).json({ ok: false, error: 'invalid_id' });
    }

    const statusSchema = z.object({
      status: z.enum(['new', 'read', 'replied', 'archived']).optional(),
      adminNote: z.string().trim().max(2000).optional().nullable(),
    });
    const parsed = statusSchema.safeParse(req.body || {});
    if (!parsed.success) {
      logger.end();
      return res.status(400).json({ ok: false, error: 'validation_error', message: 'Geçersiz güncelleme' });
    }

    const db = await getAdminDb();
    if (!db) {
      logger.end();
      return res.status(500).json({ ok: false, error: 'db_unavailable' });
    }

    const ref = db.collection(CONTACT_COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      logger.end();
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.user?.uid || null,
    };
    if (parsed.data.status) patch.status = parsed.data.status;
    if (parsed.data.adminNote !== undefined) patch.adminNote = parsed.data.adminNote;

    await ref.update(patch);
    logger.info('Contact message updated', { id, status: parsed.data.status });
    logger.end();
    return res.json({ ok: true, id, ...parsed.data });
  } catch (error: any) {
    logger.error('Contact message update failed', error);
    logger.end();
    return res.status(500).json({ ok: false, error: 'update_failed', message: error?.message || 'Güncellenemedi' });
  }
});

export default contactPublicRouter;
