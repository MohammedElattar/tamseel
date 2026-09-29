import { Router, Response } from 'express';
import { getDB, saveDB } from '../db/connection.js';
import { authenticate, requireAdmin, verifyToken, AuthRequest } from '../middleware/auth.js';
import { arabizeTextColumn, numericParam } from '../config/arabicText.js';
import { COMMITTEE_PANEL } from '../config/committeePanel.js';

// Job codes of the fixed committee panel (senior commanders). They are committee
// members, not candidates, so they are excluded from the officers browser.
const PANEL_JOB_CODES = COMMITTEE_PANEL.map(p => p.jobCode);

const router = Router();

// Detect the stored image format from its magic bytes: real imports are JPEG, seeded demo
// portraits are SVG (start with '<'), PNG starts with 0x89 0x50. Default to JPEG.
function imageContentType(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x3c) return 'image/svg+xml';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return 'image/jpeg';
}

// Serve a BLOB image or 404. Shared by the personal + family photo routes.
function sendImage(res: Response, val: any): void {
  if (!val) { res.status(404).end(); return; }
  const buf = Buffer.from(val as Uint8Array);
  res.set('Content-Type', imageContentType(buf));
  res.send(buf);
}

// Officer photo: served to <img> which can't send an auth header, so authenticate
// via ?token=. Defined before the header-auth middleware below. The uploaded portrait
// (officer_photos, keyed by officer id) wins; officers.photo is the fallback so the
// seeded demo portraits still show. Both are matched to this officer via officers.id.
router.get('/:id/photo', (req: AuthRequest, res: Response) => {
  if (!verifyToken(String(req.query.token || ''))) {
    res.status(401).end();
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).end();
    return;
  }
  const db = getDB();
  const rows = db.exec(
    `SELECT p.personal, o.photo
     FROM officers o LEFT JOIN officer_photos p ON p.officer_id = o.id
     WHERE o.id = ?`,
    [id]
  );
  const row = rows.length && rows[0].values.length ? rows[0].values[0] : null;
  sendImage(res, row ? (row[0] ?? row[1]) : null);
});

// Officer family photo (legacy FAMILY_PICT): uploaded image only, matched via officers.id.
router.get('/:id/family-photo', (req: AuthRequest, res: Response) => {
  if (!verifyToken(String(req.query.token || ''))) {
    res.status(401).end();
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).end();
    return;
  }
  const db = getDB();
  const rows = db.exec(
    `SELECT p.family FROM officers o JOIN officer_photos p ON p.officer_id = o.id WHERE o.id = ?`,
    [id]
  );
  sendImage(res, rows.length && rows[0].values.length ? rows[0].values[0][0] : null);
});
// Officer couple photo: matched via officers.id.
router.get('/:id/couple-photo', (req: AuthRequest, res: Response) => {
  if (!verifyToken(String(req.query.token || ''))) {
    res.status(401).end();
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).end();
    return;
  }
  const db = getDB();
  const rows = db.exec(
    `SELECT p.couple FROM officers o JOIN officer_photos p ON p.officer_id = o.id WHERE o.id = ?`,
    [id]
  );
  sendImage(res, rows.length && rows[0].values.length ? rows[0].values[0][0] : null);
});

router.use(authenticate);

function mapRows(results: any[]): Record<string, any>[] {
  if (!results.length || !results[0].values.length) return [];
  const columns = results[0].columns;
  return results[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

// EVAL_OFFICERS_REQUIREMENTS (نواقص ضباط المشروع): per-officer data-completeness tracker
// for the latest bulletin (rank < 6). Personal/family photos + kafaa reports are computed
// from real data (uploaded photos in officer_photos, matched by officer id); 121 ش ض /
// الأنواط come from officer_requirements. The manual family_photo flag still counts as a
// fallback for officers whose image predates the photo import.
router.get('/requirements', requireAdmin, (_req: AuthRequest, res: Response) => {
  const db = getDB();
  const nd = mapRows(db.exec('SELECT MAX(nashra_date) d FROM officers_in_nashra'))[0]?.d ?? null;
  if (!nd) {
    res.json({ nashra_date: null, officers: [] });
    return;
  }
  const rows = mapRows(db.exec(
    `SELECT o.id, o.per_name, o.akdam_no, o.akdam_rep, o.full_rank as rank_name,
            CASE WHEN o.photo IS NOT NULL OR ph.personal IS NOT NULL THEN 1 ELSE 0 END as personal_photo,
            (SELECT COUNT(*) FROM officer_kafaa k WHERE k.officer_id = o.id) as kafaa_count,
            CASE WHEN ph.family IS NOT NULL OR COALESCE(req.family_photo, 0) = 1 THEN 1 ELSE 0 END family_photo,
            COALESCE(req.sheet_121, 0) sheet_121,
            COALESCE(req.awsama, 0) awsama, req.notes
     FROM officers_in_nashra nin
     JOIN officers o ON o.id = nin.officer_id
     LEFT JOIN officer_requirements req ON req.officer_id = o.id
     LEFT JOIN officer_photos ph ON ph.officer_id = o.id
     WHERE nin.nashra_date = ? AND nin.nashra_rank < 6
       AND (nin.nashra_rank > 3 OR (nin.nashra_rank = 3 AND nin.nashra_type = 1))
     ORDER BY o.import_order, o.taraky_c, o.akdam_no, LENGTH(COALESCE(o.akdam_rep, '')), o.akdam_rep`,
    [nd]
  ));
  const officers = rows.map((o) => {
    const personal = o.personal_photo === 1;
    const kafaa = (o.kafaa_count as number) > 0;
    const family = o.family_photo === 1;
    const s121 = o.sheet_121 === 1;
    const awsama = o.awsama === 1;
    const missing = [
      !personal ? 'الصورة الشخصية' : null,
      !family ? 'الصورة العائلية' : null,
      !kafaa ? 'تقارير الكفاءة' : null,
      !s121 ? '121 ش ض' : null,
      !awsama ? 'الأنواط' : null,
    ].filter(Boolean) as string[];
    return {
      officer_id: o.id, rank_name: o.rank_name, per_name: o.per_name,
      akdam: [o.akdam_no != null ? o.akdam_no : '', o.akdam_rep || ''].filter(String).join(' '),
      personal, family, kafaa, sheet_121: s121, awsama,
      notes: o.notes || '', missing, complete: missing.length === 0,
    };
  });
  res.json({ nashra_date: nd, officers });
});

// Search officers by seniority (akdam_no) or military number (person_id) for edarya registration.
router.get('/search', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const akdamNo = numericParam(req.query.akdam_no);
  const personId = numericParam(req.query.person_id);

  if (akdamNo == null && personId == null) {
    res.status(400).json({ error: 'يجب إدخال الأقدمية أو الرقم العسكري' });
    return;
  }

  const clauses: string[] = ["o.in_service = 'Y'"];
  const params: any[] = [];
  if (akdamNo != null) { clauses.push('o.akdam_no = ?'); params.push(akdamNo); }
  if (personId != null) { clauses.push('o.person_id = ?'); params.push(personId); }

  const officers = mapRows(db.exec(
    `SELECT o.id, o.per_name, o.person_id, o.akdam_no, o.akdam_rep,
            o.full_rank as rank_name, o.unt_n as unit_name, o.job_n as job_name, o.date_khdma
     FROM officers o
     WHERE ${clauses.join(' AND ')}
     ORDER BY o.import_order, o.taraky_c, o.akdam_no, LENGTH(COALESCE(o.akdam_rep, '')), o.akdam_rep
     LIMIT 50`,
    params
  ));

  res.json(officers);
});

// List/browse officers with filters + pagination (admin officer browser).
router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const q = String(req.query.q || '').trim();
  const personId = numericParam(req.query.person_id);
  const akdamNo = numericParam(req.query.akdam_no);
  const rankText = String(req.query.rank || '').trim();
  const inService = String(req.query.in_service || 'Y');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const params: any[] = [];
  if (inService !== 'all') { clauses.push('o.in_service = ?'); params.push(inService); }
  if (q) { clauses.push('o.per_name LIKE ?'); params.push(`%${q}%`); }
  if (personId != null) { clauses.push('o.person_id = ?'); params.push(personId); }
  if (akdamNo != null) { clauses.push('o.akdam_no = ?'); params.push(akdamNo); }
  if (rankText) { clauses.push('o.full_rank LIKE ?'); params.push(`%${rankText}%`); }
  // Hide the fixed committee panel (senior commanders); they belong on the الأعضاء page.
  if (PANEL_JOB_CODES.length) {
    const ph = PANEL_JOB_CODES.map(() => '?').join(',');
    clauses.push(`(o.job_code IS NULL OR o.job_code NOT IN (${ph}))`);
    params.push(...PANEL_JOB_CODES);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const total = (mapRows(db.exec(`SELECT COUNT(*) as c FROM officers o ${where}`, params))[0]?.c as number) ?? 0;

  const officers = mapRows(db.exec(
    `SELECT o.id, o.per_name, o.person_id, o.akdam_no, o.akdam_rep, o.in_service,
            o.full_rank as rank_name, o.unt_n as unit_name, o.job_n as job_name,
            o.speciality, o.taraky_tagdeed, o.nashra_date
     FROM officers o
     ${where}
     ORDER BY o.import_order, o.taraky_c, o.akdam_no, LENGTH(COALESCE(o.akdam_rep, '')), o.akdam_rep
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  ));

  res.json({ officers, total, page, limit });
});

// ---------------------------------------------------------------------------
// Officer editing (admin): edit the imported officer record + its nested tables.
// Writes go straight to the imported tables and are intentionally overwritten by the
// next quarterly import. Scope is the app-facing CV fields only; the allowlists below
// keep writes bounded and safe.
// ---------------------------------------------------------------------------

const OFFICER_EDIT_COLS = [
  'per_name', 'full_rank', 'akdam_no', 'akdam_rep', 'person_id', 'unt_n', 'job_n',
  'speciality', 'taraky_tagdeed', 'in_service', 'weight', 'height', 'fark_wazn',
  'marital_status', 'wife_status', 'boy_no', 'girl_no', 'faculty', 'mil_qualification',
  'civil_qualification', 'off_notice', 'taraky_estifa', 'estifa_job', 'entedab',
  'se7a', 'kafaa_takreer', 'mohakma_geza', 'kyada', 'ragba', 'ra8ba_twsia',
];
const OFFICER_NUM_COLS = new Set([
  'akdam_no', 'person_id', 'weight', 'height', 'fark_wazn', 'boy_no', 'girl_no',
]);

// section key -> { table, editable columns, numeric columns, read order }. Nested rows are
// replaced wholesale per officer on save (their ids aren't referenced anywhere else).
// All are imported tables (overwritten by the next quarterly import) except `children`,
// which is a persistent, system-managed table that the import never touches.
const NESTED_SECTIONS: Record<string, { table: string; cols: string[]; num: Set<string>; order: string }> = {
  jobs: {
    table: 'officer_holder_wazayef',
    // taraky_c / taraky_c_suggested / marked_color are import-only (التدرج الوظيفي highlight). They
    // aren't rendered as edit fields, but keeping them here means the edit round-trip (which spreads
    // each loaded row) preserves them instead of wiping the highlight on save.
    cols: ['ran_n', 'unt_n', 'job_n', 'ran_n_mrtb', 'wasfia_tuahel_trky', 'from_date', 'to_date', 'year', 'month', 'taraky_c', 'taraky_c_suggested', 'marked_color'],
    num: new Set(['year', 'month', 'taraky_c', 'taraky_c_suggested']),
    order: 'from_date DESC, id',
  },
  kafaa: {
    table: 'officer_kafaa',
    cols: ['from_date_c', 'to_date', 'kaed', 'mosdak', 'from_date', 'grade_com'],
    num: new Set(['kaed', 'mosdak']),
    order: 'from_date DESC, id',
  },
  paasat: {
    table: 'officer_holder_paasat',
    cols: ['activ_name', 'activ_note', 'activ_code', 'date_from', 'date_to', 'country_name'],
    num: new Set(['activ_code']),
    order: 'date_from DESC, id',
  },
  punishments: {
    table: 'officer_punishments_geza',
    cols: ['gaza'],
    num: new Set<string>(),
    order: 'id',
  },
  health: {
    table: 'officer_holder_health',
    cols: ['se7a'],
    num: new Set<string>(),
    order: 'id',
  },
  children: {
    table: 'officer_children',
    cols: ['name', 'gender', 'date_birth', 'notes'],
    num: new Set<string>(),
    order: 'id',
  },
};

// Empty string / null -> null; numeric columns are parsed to a finite number or null.
function coerceValue(v: any, numeric: boolean): any {
  if (v === '' || v == null) return null;
  if (numeric) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return v;
}

// GET /:id/edit - raw editable payload (officer allowlisted columns + nested rows).
router.get('/:id/edit', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'معرف الضابط غير صحيح' }); return; }

  const officer = mapRows(db.exec(
    `SELECT id, ${OFFICER_EDIT_COLS.join(', ')} FROM officers WHERE id = ?`, [id]
  ))[0];
  if (!officer) { res.status(404).json({ error: 'الضابط غير موجود' }); return; }

  const payload: Record<string, any> = { officer };
  for (const [key, spec] of Object.entries(NESTED_SECTIONS)) {
    payload[key] = mapRows(db.exec(
      `SELECT id, ${spec.cols.join(', ')} FROM ${spec.table} WHERE officer_id = ? ORDER BY ${spec.order}`,
      [id]
    ));
  }
  res.json(payload);
});

// PUT /:id - save officer edits: allowlisted UPDATE + replace-all nested rows, in one
// transaction. Omitted sections are left untouched; blank rows are dropped.
router.put('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'معرف الضابط غير صحيح' }); return; }

  const exists = db.exec('SELECT 1 FROM officers WHERE id = ?', [id]);
  if (!(exists.length && exists[0].values.length)) { res.status(404).json({ error: 'الضابط غير موجود' }); return; }

  const body = req.body || {};
  const officerIn = body.officer || {};

  db.run('BEGIN');
  try {
    const setCols = OFFICER_EDIT_COLS.filter(c => Object.prototype.hasOwnProperty.call(officerIn, c));
    if (setCols.length) {
      const assignments = setCols.map(c => `${c} = ?`).join(', ');
      const vals = setCols.map(c =>
        arabizeTextColumn('officers', c, coerceValue(officerIn[c], OFFICER_NUM_COLS.has(c))));
      db.run(`UPDATE officers SET ${assignments} WHERE id = ?`, [...vals, id]);
    }

    for (const [key, spec] of Object.entries(NESTED_SECTIONS)) {
      const incoming = body[key];
      if (!Array.isArray(incoming)) continue; // section omitted -> leave unchanged
      db.run(`DELETE FROM ${spec.table} WHERE officer_id = ?`, [id]);
      const placeholders = ['officer_id', ...spec.cols].map(() => '?').join(', ');
      for (const row of incoming) {
        const values = spec.cols.map(c =>
          arabizeTextColumn(spec.table, c, coerceValue(row?.[c], spec.num.has(c))));
        if (values.every(v => v == null)) continue; // skip blank rows
        db.run(
          `INSERT INTO ${spec.table} (officer_id, ${spec.cols.join(', ')}) VALUES (${placeholders})`,
          [id, ...values]
        );
      }
    }

    db.run('COMMIT');
  } catch (e: any) {
    db.run('ROLLBACK');
    res.status(400).json({ error: e?.message || 'فشل حفظ التعديلات' });
    return;
  }

  saveDB();
  res.json({ message: 'تم حفظ التعديلات' });
});

// DELETE /:id - remove an imported officer and their owned nested rows. Blocked while the
// officer is registered in a non-completed committee (deleting live data would break that
// pending/active session; completed committees keep their own snapshots and are unaffected).
router.delete('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'معرف الضابط غير صحيح' }); return; }

  const exists = db.exec('SELECT 1 FROM officers WHERE id = ?', [id]);
  if (!(exists.length && exists[0].values.length)) { res.status(404).json({ error: 'الضابط غير موجود' }); return; }

  const inCommittee = db.exec(
    `SELECT 1 FROM committee_officers co JOIN committees c ON c.id = co.committee_id
     WHERE co.officer_id = ? AND c.status <> 'completed' LIMIT 1`,
    [id]
  );
  if (inCommittee.length && inCommittee[0].values.length) {
    res.status(400).json({ error: 'لا يمكن حذف ضابط مسجل في لجنة نشطة أو قيد الإعداد — قم بإزالته من اللجنة أولاً' });
    return;
  }

  // Officer-owned imported tables (keyed by officer_id). officer_photos is also keyed by
  // officer id but left in place (persistent; re-matches if the officer is imported again).
  const childTables = [
    'officer_kafaa', 'officer_punishments_geza', 'officer_holder_wazayef', 'officer_holder_kafaa',
    'officer_holder_paasat', 'officer_holder_health', 'officer_tahil_3lmy', 'officer_tahil_3askary',
    'takyeem_scores', 'officers_in_nashra',
    'derasat_olia', 'twsia', 'nah_rankd_tmp', 'officer_requirements',
  ];

  db.run('BEGIN');
  try {
    for (const t of childTables) db.run(`DELETE FROM ${t} WHERE officer_id = ?`, [id]);
    db.run('DELETE FROM officers WHERE id = ?', [id]);
    db.run('COMMIT');
  } catch (e: any) {
    db.run('ROLLBACK');
    res.status(400).json({ error: e?.message || 'فشل حذف الضابط' });
    return;
  }

  saveDB();
  res.json({ message: 'تم حذف الضابط' });
});

export default router;
