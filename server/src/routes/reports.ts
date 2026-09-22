import { Router, Response } from 'express';
import { getDB } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

function mapRows(results: any[]): Record<string, any>[] {
  if (!results.length || !results[0].values.length) return [];
  const columns = results[0].columns;
  return results[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

// TODO: GET /committee/:committeeId/decisions-card
router.get('/committee/:committeeId/decisions-card', (_req: AuthRequest, res: Response) => {
  res.status(501).json({ error: 'لم يتم التنفيذ بعد' });
});

// TODO: GET /committee/:committeeId/credentials
router.get('/committee/:committeeId/credentials', (_req: AuthRequest, res: Response) => {
  res.json([]);
});

// TODO: GET /committee/:committeeId/statistics
router.get('/committee/:committeeId/statistics', (_req: AuthRequest, res: Response) => {
  res.status(501).json({ error: 'لم يتم التنفيذ بعد' });
});

export default router;
