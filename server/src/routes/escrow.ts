import { Router } from 'express';

type Audit = { at: string; by: string; action: string; meta?: any };
type Escrow = { id: string; status: string; audit: Audit[]; demandId?: string; bidId?: string };

const escrows = new Map<string, Escrow>();
const router = Router();

function createAudit(action: string, by = 'system', meta: any = {}): Audit {
  return { at: new Date().toISOString(), by, action, meta };
}

router.post('/create', (req, res) => {
  const id = Math.random().toString(36).slice(2, 10);
  const e: Escrow = { id, status: 'awaiting_funds', audit: [createAudit('create')], demandId: req.body?.demandId, bidId: req.body?.bidId };
  escrows.set(id, e);
  res.json(e);
});

router.post('/upload-proof', (req, res) => {
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).send('not found');
  e.audit.push(createAudit('upload-proof'));
  res.json(e);
});

router.post('/webhook/bank', (req, res) => {
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).send('not found');
  e.status = 'in_escrow';
  e.audit.push(createAudit('bank-ok', 'bank'));
  res.json(e);
});

router.post('/ship-docs', (req, res) => {
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).send('not found');
  e.status = 'shipped';
  e.audit.push(createAudit('ship-docs', 'seller'));
  res.json(e);
});

router.post('/approve-delivery', (req, res) => {
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).send('not found');
  e.status = 'released';
  e.audit.push(createAudit('approve-delivery', 'buyer'));
  res.json(e);
});

router.post('/dispute', (req, res) => {
  const { id } = req.body || {};
  const e = escrows.get(id);
  if (!e) return res.status(404).send('not found');
  e.status = 'dispute';
  e.audit.push(createAudit('dispute'));
  res.json(e);
});

router.get('/:id', (req, res) => {
  const e = escrows.get(req.params.id);
  if (!e) return res.status(404).send('not found');
  res.json(e);
});

export default router;


