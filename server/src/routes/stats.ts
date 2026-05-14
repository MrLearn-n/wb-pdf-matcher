import { Router } from 'express';
import { getStats, resetAll } from '../services/db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getStats());
});

router.post('/reset', (_req, res) => {
  resetAll();
  res.json({ ok: true });
});

export default router;
