import { Router } from 'express';

type Pref = { id: string; payload: any; at: string };
const prefs: Pref[] = [];
const router = Router();

router.post('/', (req, res) => {
  const id = Math.random().toString(36).slice(2, 10);
  const rec: Pref = { id, payload: req.body, at: new Date().toISOString() };
  prefs.push(rec);
  res.json({ id, ok: true });
});

router.get('/', (_req, res) => { res.json(prefs); });

export default router;


