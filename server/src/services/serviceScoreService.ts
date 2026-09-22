import { getDB } from '../db/connection.js';

function mapRows(results: any[]): Record<string, any>[] {
  if (!results.length || !results[0].values.length) return [];
  const cols: string[] = results[0].columns;
  return results[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
    return obj;
  });
}

// The seven مسير الخدمة components (the evaluator types a degree for each).
export const SCORE_COMPONENTS = ['jobs', 'tahil', 'kafaa', 'tashkeelat', 'awsama', 'ba3asat', 'gaza'] as const;
export type ScoreComponent = typeof SCORE_COMPONENTS[number];

// أسس التقييم: the max degree per component, ordered for display.
export function getBasis(): { component: string; label: string; max_degree: number; sort_order: number }[] {
  const db = getDB();
  return mapRows(db.exec(
    'SELECT component, label, max_degree, sort_order FROM score_basis ORDER BY sort_order, component'
  )) as any;
}

// SUM of the component maxes — the denominator for the percentage (~1050).
export function totalMax(): number {
  const db = getDB();
  const r = db.exec('SELECT COALESCE(SUM(max_degree), 0) FROM score_basis');
  return Number(r[0]?.values[0]?.[0] ?? 0);
}

// متوسط تقارير الكفاءة: ROUND(AVG(commander rating)). null when the officer has no rated reports.
export function officerKafaaAvg(officerId: number): number | null {
  const db = getDB();
  const r = db.exec(
    'SELECT ROUND(AVG(kaed)) FROM officer_kafaa WHERE officer_id = ? AND kaed IS NOT NULL',
    [officerId]
  );
  const v = r.length && r[0].values.length ? r[0].values[0][0] : null;
  return v == null ? null : Number(v);
}

// Suggested initial التأهيل degree from the imported qualification grade (best), clamped to its max.
export function tahilPrefill(officerId: number): number | null {
  const db = getDB();
  const r = db.exec(
    'SELECT MAX(grade) FROM officer_qualification WHERE officer_id = ? AND grade IS NOT NULL',
    [officerId]
  );
  const v = r.length && r[0].values.length ? r[0].values[0][0] : null;
  if (v == null) return null;
  const mx = Number(getBasis().find(b => b.component === 'tahil')?.max_degree ?? 0);
  let g = Number(v);
  if (mx > 0 && g > mx) g = mx;
  return g;
}

export function getServiceScore(officerId: number): Record<string, any> | null {
  const db = getDB();
  return mapRows(db.exec('SELECT * FROM officer_service_score WHERE officer_id = ?', [officerId]))[0] ?? null;
}

// Save the admin-entered degrees: clamp each to [0, max], compute the kafaa average + total + pct,
// and upsert. No derivation — the degrees come straight from the evaluator. Caller handles saveDB.
export function computeAndSave(
  officerId: number,
  scores: Partial<Record<ScoreComponent, number | null>>,
  english?: number | null
): Record<string, any> {
  const db = getDB();
  const maxByComp: Record<string, number> = {};
  for (const b of getBasis()) maxByComp[b.component] = Number(b.max_degree) || 0;

  const clamped: Record<string, number | null> = {};
  let total = 0;
  for (const c of SCORE_COMPONENTS) {
    const raw = scores[c];
    let v = raw == null || (raw as any) === '' ? null : Number(raw);
    if (v != null && !Number.isFinite(v)) v = null;
    if (v != null) {
      const mx = maxByComp[c] ?? 0;
      if (v < 0) v = 0;
      if (mx > 0 && v > mx) v = mx;
      total += v;
    }
    clamped[c] = v;
  }

  const tMax = totalMax();
  const pct = tMax > 0 ? Math.round((total / tMax) * 1000) / 10 : 0; // one decimal place
  const kafaaAvg = officerKafaaAvg(officerId);

  // لغة إنجليزية بند: admin-entered (0..100), independent of the مسير الخدمة total/pct. When the
  // caller omits it (undefined) keep the stored value; a null clears it; a number is clamped.
  let engVal: number | null;
  if (english === undefined) {
    engVal = (getServiceScore(officerId)?.english ?? null) as number | null;
  } else if (english === null || (english as any) === '') {
    engVal = null;
  } else {
    let e = Number(english);
    if (!Number.isFinite(e)) e = 0;
    engVal = Math.max(0, Math.min(e, 100));
  }

  db.run(
    `INSERT INTO officer_service_score
       (officer_id, jobs, tahil, kafaa, tashkeelat, awsama, ba3asat, gaza, kafaa_avg, total, pct, english, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(officer_id) DO UPDATE SET
       jobs = excluded.jobs, tahil = excluded.tahil, kafaa = excluded.kafaa,
       tashkeelat = excluded.tashkeelat, awsama = excluded.awsama, ba3asat = excluded.ba3asat,
       gaza = excluded.gaza, kafaa_avg = excluded.kafaa_avg, total = excluded.total,
       pct = excluded.pct, english = excluded.english, updated_at = excluded.updated_at`,
    [
      officerId, clamped.jobs, clamped.tahil, clamped.kafaa, clamped.tashkeelat,
      clamped.awsama, clamped.ba3asat, clamped.gaza, kafaaAvg, total, pct, engVal,
    ]
  );

  return { officer_id: officerId, ...clamped, kafaa_avg: kafaaAvg, total, pct, english: engVal };
}
