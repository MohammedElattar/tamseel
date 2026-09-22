import { Router, Response } from 'express';
import { getDB } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

function queryAll(table: string, orderBy?: string): Record<string, any>[] {
  const db = getDB();
  const order = orderBy ? ` ORDER BY ${orderBy}` : '';
  const results = db.exec(`SELECT * FROM ${table}${order}`);
  if (!results.length) return [];
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj: Record<string, any> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

router.get('/ranks', (_req: AuthRequest, res: Response) => {
  res.json(queryAll('ranks', 'ran_c'));
});

router.get('/cadres', (_req: AuthRequest, res: Response) => {
  res.json(queryAll('cadres', 'kad_c'));
});

router.get('/kindoff', (_req: AuthRequest, res: Response) => {
  res.json(queryAll('kindoff', 'kin_c'));
});

router.get('/units', (_req: AuthRequest, res: Response) => {
  res.json(queryAll('units', 'unt_n'));
});

router.get('/jobs', (_req: AuthRequest, res: Response) => {
  res.json(queryAll('jobs', 'job_n'));
});

router.get('/lagna-categories', (_req: AuthRequest, res: Response) => {
  res.json(queryAll('eval_lagna_cat', 'cat_c'));
});

router.get('/lagna-types', (_req: AuthRequest, res: Response) => {
  res.json(queryAll('l_lagna_type', 'taraky_c'));
});

router.get('/grades', (_req: AuthRequest, res: Response) => {
  res.json(queryAll('grades', 'grade_id'));
});

export default router;
