// Teklifbul Rule v1.0 - DEMO/DEV-only escrow route
// UYARI: Bu rota in-memory state ile calisan demo amacli bir akistir.
// Production'da kullanilmamalidir; index.ts icinde NODE_ENV !== 'production'
// ve ENABLE_ESCROW_DEMO=true ise verifyToken arkasinda mount edilir.
import { Router } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth';
import { logger } from '../../../src/shared/log/logger.js';

type Audit = { at: string; by: string; uid: string; action: string; meta?: any };
type Escrow = {
  id: string;
  status: string;
  audit: Audit[];
  demandId?: string;
  bidId?: string;
  ownerUid: string;
};

const escrows = new Map<string, Escrow>();
const router = Router();

function createAudit(action: string, by: string, uid: string, meta: any = {}): Audit {
  return { at: new Date().toISOString(), by, uid, action, meta };
}

function requireUid(req: AuthenticatedRequest): string | null {
  return req.user?.uid || null;
}

router.post('/create', (req: AuthenticatedRequest, res) => {
  const uid = requireUid(req);
  if (!uid) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const id = Math.random().toString(36).slice(2, 10);
  const e: Escrow = {
    id,
    status: 'awaiting_funds',
    audit: [createAudit('create', 'buyer', uid)],
    demandId: typeof req.body?.demandId === 'string' ? req.body.demandId : undefined,
    bidId: typeof req.body?.bidId === 'string' ? req.body.bidId : undefined,
    ownerUid: uid,
  };
  escrows.set(id, e);
  logger.info('[escrow] created', { id, uid });
  res.json(e);
});

router.post('/upload-proof', (req: AuthenticatedRequest, res) => {
  const uid = requireUid(req);
  if (!uid) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).json({ error: 'NOT_FOUND' });
  if (e.ownerUid !== uid) return res.status(403).json({ error: 'FORBIDDEN' });
  e.audit.push(createAudit('upload-proof', 'buyer', uid));
  res.json(e);
});

router.post('/webhook/bank', (req, res) => {
  // Banka webhook'u harici imzayla dogrulanmali; demo amacli ENABLE_ESCROW_DEMO arkasinda
  const expectedSecret = process.env.ESCROW_BANK_WEBHOOK_SECRET || '';
  const provided = String(req.headers['x-escrow-bank-secret'] || '');
  if (!expectedSecret || provided !== expectedSecret) {
    return res.status(401).json({ error: 'INVALID_SIGNATURE' });
  }
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).json({ error: 'NOT_FOUND' });
  e.status = 'in_escrow';
  e.audit.push(createAudit('bank-ok', 'bank', 'system'));
  res.json(e);
});

router.post('/ship-docs', (req: AuthenticatedRequest, res) => {
  const uid = requireUid(req);
  if (!uid) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).json({ error: 'NOT_FOUND' });
  // Demo: yalnizca olusturanin disinda biri (satici) yapabilir
  if (e.ownerUid === uid) return res.status(403).json({ error: 'FORBIDDEN_SAME_PARTY' });
  e.status = 'shipped';
  e.audit.push(createAudit('ship-docs', 'seller', uid));
  res.json(e);
});

router.post('/approve-delivery', (req: AuthenticatedRequest, res) => {
  const uid = requireUid(req);
  if (!uid) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).json({ error: 'NOT_FOUND' });
  if (e.ownerUid !== uid) return res.status(403).json({ error: 'FORBIDDEN' });
  e.status = 'released';
  e.audit.push(createAudit('approve-delivery', 'buyer', uid));
  res.json(e);
});

router.post('/dispute', (req: AuthenticatedRequest, res) => {
  const uid = requireUid(req);
  if (!uid) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).json({ error: 'NOT_FOUND' });
  if (e.ownerUid !== uid) return res.status(403).json({ error: 'FORBIDDEN' });
  e.status = 'dispute';
  e.audit.push(createAudit('dispute', 'buyer', uid));
  res.json(e);
});

router.get('/:id', (req: AuthenticatedRequest, res) => {
  const uid = requireUid(req);
  if (!uid) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const e = escrows.get(req.params.id);
  if (!e) return res.status(404).json({ error: 'NOT_FOUND' });
  // Sadece sahibi okuyabilir (demo)
  if (e.ownerUid !== uid) return res.status(403).json({ error: 'FORBIDDEN' });
  res.json(e);
});

export default router;
