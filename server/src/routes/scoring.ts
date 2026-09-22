import { Router, Response } from 'express';
import { getDB, saveDB } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import {
  getBasis, totalMax, getServiceScore, computeAndSave, officerKafaaAvg, tahilPrefill,
  SCORE_COMPONENTS,
} from '../services/serviceScoreService.js';

const router = Router();
router.use(authenticate);

function mapRows(results: any[]): Record<string, any>[] {
  if (!results.length || !results[0].values.length) return [];
  const cols: string[] = results[0].columns;
  return results[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
    return obj;
  });
}

// أسس التقييم: the component maxes + their sum (the percentage denominator).
router.get('/basis', (_req: AuthRequest, res: Response) => {
  res.json({ basis: getBasis(), total_max: totalMax() });
});

// Update the component maxes (admin). Body: { rows: [{ component, max_degree, label? }] }.
router.put('/basis', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) { res.status(400).json({ error: 'لا توجد بيانات للتحديث' }); return; }
  for (const r of rows) {
    const component = String(r?.component || '').trim();
    if (!component) continue;
    const max = r?.max_degree === null || r?.max_degree === '' ? 0 : Number(r.max_degree);
    if (!Number.isFinite(max) || max < 0) continue;
    if (r?.label != null) {
      db.run('UPDATE score_basis SET max_degree = ?, label = ? WHERE component = ?', [max, String(r.label), component]);
    } else {
      db.run('UPDATE score_basis SET max_degree = ? WHERE component = ?', [max, component]);
    }
  }
  saveDB();
  res.json({ basis: getBasis(), total_max: totalMax() });
});

// Everything the per-officer entry screen needs: the maxes, the saved/prefilled degrees, the
// computed kafaa average, and the raw data of each component so the evaluator can decide a degree.
router.get('/officer/:id', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const officerId = Number(req.params.id);
  if (!Number.isInteger(officerId)) { res.status(400).json({ error: 'معرف الضابط غير صحيح' }); return; }

  const officer = mapRows(db.exec(
    'SELECT id, per_name, full_rank AS rank_name, akdam_no, akdam_rep, unt_n AS unit_name, job_n AS job_name FROM officers WHERE id = ?',
    [officerId]
  ))[0];
  if (!officer) { res.status(404).json({ error: 'الضابط غير موجود' }); return; }

  const data = {
    jobs: mapRows(db.exec(
      `SELECT ran_n, unt_n, job_n, ran_n_mrtb, wasfia_tuahel_trky, from_date, to_date, year, month, marked_color
       FROM officer_holder_wazayef WHERE officer_id = ? ORDER BY from_date DESC`, [officerId])),
    kafaa: mapRows(db.exec(
      `SELECT from_date_c, to_date, kaed, mosdak, grade_com FROM officer_kafaa
       WHERE officer_id = ? ORDER BY from_date DESC`, [officerId])),
    tashkeelat: mapRows(db.exec(
      'SELECT tashkeelat, khadma FROM officer_tashkeelat WHERE officer_id = ?', [officerId])),
    medals: mapRows(db.exec(
      'SELECT wis_n FROM officer_medals WHERE officer_id = ? ORDER BY id', [officerId])),
    ba3asat: mapRows(db.exec(
      `SELECT activ_name, activ_note, country_name, date_from, date_to FROM officer_holder_paasat
       WHERE officer_id = ? ORDER BY date_from DESC`, [officerId])),
    geza: mapRows(db.exec(
      'SELECT gaza FROM officer_punishments_geza WHERE officer_id = ? ORDER BY id', [officerId])),
    qualification: mapRows(db.exec(
      'SELECT txt, grade FROM officer_qualification WHERE officer_id = ? ORDER BY id', [officerId])),
  };

  res.json({
    officer,
    basis: getBasis(),
    total_max: totalMax(),
    score: getServiceScore(officerId),
    kafaa_avg: officerKafaaAvg(officerId),
    tahil_prefill: tahilPrefill(officerId),
    data,
  });
});

// Save the entered degrees for one officer; compute + store total/pct/kafaa_avg.
router.put('/officer/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const officerId = Number(req.params.id);
  if (!Number.isInteger(officerId)) { res.status(400).json({ error: 'معرف الضابط غير صحيح' }); return; }
  const body = req.body ?? {};
  const scores: Record<string, number | null> = {};
  for (const c of SCORE_COMPONENTS) {
    const v = body[c];
    scores[c] = v === undefined || v === null || v === '' ? null : Number(v);
  }
  // لغة إنجليزية بند (admin-entered): omit → preserve stored value; '' / null → clear.
  const english = !('english' in body) ? undefined
    : (body.english === null || body.english === '' ? null : Number(body.english));
  const result = computeAndSave(officerId, scores, english);
  saveDB();
  res.json(result);
});

// روستر درجات مسير الخدمة للجنة: ضباط اللجنة + نسبة كلٍّ وحالة إدخاله.
router.get('/committee/:id', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) { res.status(400).json({ error: 'معرف اللجنة غير صحيح' }); return; }
  const officers = mapRows(db.exec(
    `SELECT co.officer_id, co.serial, co.officer_name, co.rank_name, co.akdam_no, co.akdam_rep,
            ss.pct, ss.total, ss.updated_at,
            CASE WHEN ss.officer_id IS NULL THEN 0 ELSE 1 END AS has_score
     FROM committee_officers co
     LEFT JOIN officer_service_score ss ON ss.officer_id = co.officer_id
     WHERE co.committee_id = ? ORDER BY co.serial`, [committeeId]));
  res.json({
    officers,
    total_max: totalMax(),
    scored: officers.filter((o: any) => o.has_score).length,
    total: officers.length,
  });
});

export default router;
