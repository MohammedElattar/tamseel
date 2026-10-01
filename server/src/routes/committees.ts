import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDB, saveDB } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { COMMITTEE_PANEL } from '../config/committeePanel.js';
import { kaedTawsyaFromText, tamseelDecision } from '../config/decision.js';
import {
  calculateTagddedDecision, finalizeTagddedDecisions,
} from '../services/scoringService.js';
import { backupCommittee, listBackups, restoreCommittee } from '../services/backupService.js';
import { resolvePanelIdentities } from '../services/panelMembers.js';
import { SESSION_ORDER_BY, resequenceByCategory } from '../services/sessionOrder.js';

const DEFAULT_MEMBER_PASSWORD = 'member123';

// Faithful port of legacy off.get_next_nashra_date: the upcoming bulletin date, i.e. the
// latest nashra in officers_in_nashra. Committees compute نشرة automatically from it.
function getNextNashraDate(db: any): string | null {
  const r = db.exec('SELECT MAX(nashra_date) AS d FROM officers_in_nashra');
  const v = r.length && r[0].values.length ? r[0].values[0][0] : null;
  return (v as string) ?? null;
}

const router = Router();
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

// Copy the بنود template into a committee (replace). Used on create and by «تحميل البنود».
function copyEvalTemplate(db: any, committeeId: number): number {
  db.run('DELETE FROM committee_eval_items WHERE committee_id = ?', [committeeId]);
  const tpl = mapRows(db.exec(
    'SELECT serial, name, max_degree, kind, source FROM eval_item_template ORDER BY serial, id'
  ));
  for (const t of tpl) {
    db.run(
      `INSERT INTO committee_eval_items (committee_id, serial, name, max_degree, kind, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [committeeId, t.serial ?? null, t.name, t.max_degree ?? 0, t.kind || 'manual', t.source ?? null]
    );
  }
  return tpl.length;
}

router.get('/', (_req: AuthRequest, res: Response) => {
  const db = getDB();
  const results = db.exec(
    `SELECT c.*, r.ran_n as rank_name,
            cat.cat_n as lagna_cat_name
     FROM committees c
     LEFT JOIN ranks r ON c.rank_code = r.ran_c
     LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c
     ORDER BY c.created_at DESC`
  );
  res.json(mapRows(results));
});

router.post('/', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const {
    committee_type, lagna_date, lagna_cat_c,
    nashra_date, tamhidy, hide_decision, prev_tamhidy_committee_id,
  } = req.body;

  if (!committee_type || !['edarya', 'tagdded'].includes(committee_type)) {
    res.status(400).json({ error: 'نظام اللجنة غير صحيح' });
    return;
  }

  if (!lagna_cat_c) {
    res.status(400).json({ error: 'نوع اللجنة مطلوب' });
    return;
  }

  if (!lagna_date) {
    res.status(400).json({ error: 'بداية اللجنة مطلوبة' });
    return;
  }

  // العام التدريبي: default to the latest imported officers' training year.
  const trainingYear = (mapRows(db.exec('SELECT MAX(training_year) AS y FROM officers'))[0]?.y as number) ?? null;

  db.run(
    `INSERT INTO committees
       (committee_type, lagna_date, lagna_cat_c,
        nashra_date, tamhidy, hide_decision, prev_tamhidy_committee_id, training_year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      committee_type,
      lagna_date,
      lagna_cat_c,
      nashra_date || getNextNashraDate(db),
      tamhidy ?? 0,
      hide_decision ?? 0,
      prev_tamhidy_committee_id || null,
      trainingYear,
    ]
  );

  const idResult = db.exec('SELECT last_insert_rowid()');
  const newId = idResult[0]?.values[0]?.[0] as number;
  // Seed this committee's بنود from the default template (each committee edits its own copy).
  copyEvalTemplate(db, newId);
  saveDB();

  res.status(201).json({ id: newId, message: 'تم إنشاء اللجنة بنجاح' });
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const committeeRows = mapRows(db.exec(
    `SELECT c.*, cat.cat_n as lagna_cat_name
     FROM committees c
     LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c
     WHERE c.id = ?`,
    [id]
  ));

  if (!committeeRows.length) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }

  const members = mapRows(db.exec(
    `SELECT cma.user_id, cma.serial, cma.included,
            cma.name_snapshot as officer_name,
            cma.rank_snapshot as rank_name,
            u.username, u.job_title
     FROM committee_member_assignments cma
     JOIN users u ON cma.user_id = u.id
     WHERE cma.committee_id = ?
     ORDER BY cma.serial`,
    [id]
  ));

  res.json({ committee: committeeRows[0], members });
});

// Update editable committee params (draft only; type is fixed after creation, and a finished
// committee is locked).
router.put('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id, is_active, status FROM committees WHERE id = ?', [id]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  if (committee.is_active === 1 || committee.status === 'active') {
    res.status(400).json({ error: 'لا يمكن تعديل لجنة نشطة - أوقف الجلسة أولاً' });
    return;
  }
  if (committee.status === 'completed') {
    res.status(400).json({ error: 'لا يمكن تعديل لجنة منتهية' });
    return;
  }

  const editable = ['lagna_cat_c', 'lagna_date', 'nashra_date', 'tamhidy', 'hide_decision', 'prev_tamhidy_committee_id'];
  const nullable = new Set(['nashra_date', 'prev_tamhidy_committee_id']);
  const updates: string[] = [];
  const params: any[] = [];
  for (const f of editable) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(nullable.has(f) ? (req.body[f] || null) : req.body[f]);
    }
  }
  if (!updates.length) {
    res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
    return;
  }
  params.push(id);
  db.run(`UPDATE committees SET ${updates.join(', ')} WHERE id = ?`, params);
  saveDB();
  res.json({ message: 'تم تحديث اللجنة' });
});

router.post('/:id/load-members', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const committee = mapRows(db.exec('SELECT id FROM committees WHERE id = ?', [committeeId]));
  if (!committee.length) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }

  const defaultHash = bcrypt.hashSync(DEFAULT_MEMBER_PASSWORD, 10);
  // Real member names/ranks come from the imported MEMBERS roster (استيراد البيانات), matched
  // to each seat by job title. Empty when nothing was imported yet — we then fall back to the
  // officer job-code lookup, then the panel config defaults.
  const panelIdentities = resolvePanelIdentities(db);
  let loaded = 0;
  const skipped: string[] = [];

  for (const slot of COMMITTEE_PANEL) {
    const identity = panelIdentities.get(slot.slot);
    const officer = mapRows(db.exec(
      `SELECT o.id, o.per_name, o.full_rank as rank_name
       FROM officers o
       WHERE o.job_code = ? AND o.in_service = 'Y'
       LIMIT 1`,
      [slot.jobCode]
    ))[0];

    // Name/rank priority: imported MEMBERS row → officer holding the job code → panel default →
    // the position as a last-resort placeholder, so the committee always has a full voting panel
    // even after a text-only ELASASY import that carries no job codes. ('x' marks a seat whose
    // real holder is unknown in the config, so it is treated as absent.)
    const defaultName = slot.name && slot.name !== 'x' ? slot.name : slot.position;
    const officerId = (officer?.id as number | undefined) ?? null;
    const memberName = identity?.name || (officer?.per_name as string | undefined) || defaultName;
    const rankName = identity?.rank || (officer?.rank_name as string | undefined) || slot.rank || '';

    // Upsert the global member account keyed by EVAL slot (username).
    const existingUser = mapRows(db.exec(
      'SELECT id FROM users WHERE username = ?',
      [slot.slot]
    ))[0];

    let userId: number;
    if (existingUser) {
      userId = existingUser.id as number;
      db.run(
        `UPDATE users
         SET officer_id = ?, display_name = ?, job_title = ?, job_code = ?
         WHERE id = ?`,
        [officerId, memberName, slot.position, slot.jobCode, userId]
      );
    } else {
      db.run(
        `INSERT INTO users (username, password_hash, role, officer_id, display_name, job_title, job_code)
         VALUES (?, ?, 'member', ?, ?, ?, ?)`,
        [slot.slot, defaultHash, officerId, memberName, slot.position, slot.jobCode]
      );
      userId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
    }

    // Upsert the committee assignment (preserve included flag on re-load).
    const existingAssignment = mapRows(db.exec(
      'SELECT id FROM committee_member_assignments WHERE committee_id = ? AND user_id = ?',
      [committeeId, userId]
    ))[0];

    if (existingAssignment) {
      db.run(
        `UPDATE committee_member_assignments
         SET serial = ?, job_code_snapshot = ?, name_snapshot = ?, rank_snapshot = ?
         WHERE id = ?`,
        [slot.serial, slot.jobCode, memberName, rankName, existingAssignment.id]
      );
    } else {
      db.run(
        `INSERT INTO committee_member_assignments
           (committee_id, user_id, serial, included, job_code_snapshot, name_snapshot, rank_snapshot)
         VALUES (?, ?, ?, 1, ?, ?, ?)`,
        [committeeId, userId, slot.serial, slot.jobCode, memberName, rankName]
      );
    }

    loaded++;
  }

  saveDB();
  res.json({ loaded, skipped, message: `تم تحميل ${loaded} عضو` });
});

// Create a custom committee member (a global member account + an assignment to this
// committee). Complements "تحميل الأعضاء" which only loads the fixed commander panel.
router.post('/:id/members', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id FROM committees WHERE id = ?', [committeeId]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }

  const username = String(req.body?.username || '').trim();
  const displayName = String(req.body?.display_name || '').trim();
  const rankName = req.body?.rank_name != null ? String(req.body.rank_name).trim() : '';
  const jobTitle = req.body?.job_title != null ? String(req.body.job_title).trim() : '';
  const password = String(req.body?.password || '').trim() || DEFAULT_MEMBER_PASSWORD;

  if (!username) {
    res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    return;
  }
  if (!displayName) {
    res.status(400).json({ error: 'اسم العضو مطلوب' });
    return;
  }
  if (mapRows(db.exec('SELECT id FROM users WHERE username = ?', [username])).length) {
    res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  db.run(
    `INSERT INTO users (username, password_hash, role, display_name, job_title)
     VALUES (?, ?, 'member', ?, ?)`,
    [username, hash, displayName, jobTitle || null]
  );
  const userId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;

  const maxSer = db.exec('SELECT COALESCE(MAX(serial), 0) FROM committee_member_assignments WHERE committee_id = ?', [committeeId]);
  const nextSerial = (maxSer[0]?.values[0]?.[0] as number) + 1;
  db.run(
    `INSERT INTO committee_member_assignments
       (committee_id, user_id, serial, included, name_snapshot, rank_snapshot)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [committeeId, userId, nextSerial, displayName, rankName || null]
  );

  saveDB();
  res.status(201).json({ user_id: userId, message: 'تم إضافة العضو' });
});

// Reorder members: `order` is user_ids in the new order -> serial = index+1.
// Defined before /:id/members/:userId so "reorder" isn't captured as :userId.
router.patch('/:id/members/reorder', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const { order } = req.body;
  if (!Number.isInteger(committeeId) || !Array.isArray(order)) {
    res.status(400).json({ error: 'بيانات غير صحيحة' });
    return;
  }
  order.forEach((userId: any, i: number) => {
    db.run(
      'UPDATE committee_member_assignments SET serial = ? WHERE committee_id = ? AND user_id = ?',
      [i + 1, committeeId, Number(userId)]
    );
  });
  saveDB();
  res.json({ message: 'تم تحديث الترتيب' });
});

router.patch('/:id/members/:userId', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const userId = Number(req.params.userId);
  const { included } = req.body;

  if (!Number.isInteger(committeeId) || !Number.isInteger(userId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }

  const existing = mapRows(db.exec(
    'SELECT id FROM committee_member_assignments WHERE committee_id = ? AND user_id = ?',
    [committeeId, userId]
  ));
  if (!existing.length) {
    res.status(404).json({ error: 'العضو غير موجود في اللجنة' });
    return;
  }

  db.run(
    'UPDATE committee_member_assignments SET included = ? WHERE committee_id = ? AND user_id = ?',
    [included ? 1 : 0, committeeId, userId]
  );
  saveDB();
  res.json({ message: 'تم التحديث' });
});

// Remove a member from this committee (and their votes here). The global member
// account is deleted too once it has no remaining committee assignments.
router.delete('/:id/members/:userId', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!Number.isInteger(committeeId) || !Number.isInteger(userId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id, is_active, status FROM committees WHERE id = ?', [committeeId]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  if (committee.is_active === 1 || committee.status === 'active') {
    res.status(400).json({ error: 'لا يمكن حذف عضو أثناء جلسة نشطة - أوقف الجلسة أولاً' });
    return;
  }
  const existing = mapRows(db.exec(
    'SELECT id FROM committee_member_assignments WHERE committee_id = ? AND user_id = ?',
    [committeeId, userId]
  ));
  if (!existing.length) {
    res.status(404).json({ error: 'العضو غير موجود في اللجنة' });
    return;
  }

  db.run('DELETE FROM member_votes WHERE committee_id = ? AND user_id = ?', [committeeId, userId]);
  db.run('DELETE FROM committee_member_assignments WHERE committee_id = ? AND user_id = ?', [committeeId, userId]);

  // Drop the global member account if it is no longer assigned to any committee.
  const stillUsed = mapRows(db.exec(
    'SELECT 1 FROM committee_member_assignments WHERE user_id = ? LIMIT 1', [userId]
  )).length > 0;
  const role = mapRows(db.exec('SELECT role FROM users WHERE id = ?', [userId]))[0]?.role;
  if (!stillUsed && role === 'member') {
    db.run('DELETE FROM member_votes WHERE user_id = ?', [userId]);
    db.run('DELETE FROM users WHERE id = ?', [userId]);
  }

  saveDB();
  res.json({ message: 'تم حذف العضو' });
});

// Load promotion officers from the nashra/bulletin matching the committee's nashra date.
router.post('/:id/load-officers', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const committee = mapRows(db.exec('SELECT id FROM committees WHERE id = ?', [committeeId]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }

  // التمثيل العسكري: every imported officer is a candidate (the ELASASY dump is already the
  // ASAASY='مرشح تمثيل عسكرى' list), so load them all — no taraky_c / nashra filter.
  const eligible = mapRows(db.exec(
    `SELECT id AS officer_id, full_rank AS rank_name, per_name, unt_n AS unit_name,
            job_n AS job_name, akdam_no, akdam_rep, taraky_c, tawsya_ka2ed, activ_note
     FROM officers
     WHERE in_service = 'Y' AND COALESCE(is_deleted, 0) = 0
     ORDER BY import_order, akdam_no, LENGTH(COALESCE(akdam_rep, '')), akdam_rep`
  ));

  db.run('DELETE FROM committee_officers WHERE committee_id = ?', [committeeId]);
  db.run('DELETE FROM committee_category_intros WHERE committee_id = ?', [committeeId]);

  eligible.forEach((c: any, i: number) => {
    db.run(
      `INSERT INTO committee_officers
         (committee_id, officer_id, serial, rank_name, officer_name,
          unit_name, job_name, akdam_no, akdam_rep, l_lagna_type_c, kaed_tawsya, target_job)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        committeeId, c.officer_id, i + 1, c.rank_name, c.per_name,
        c.unit_name || null, c.job_name || null, c.akdam_no ?? null, c.akdam_rep || null, c.taraky_c,
        // توصية القائد بالإحالة is one field: seed the per-committee toggle from the imported
        // bulletin text so the admin sees it pre-filled instead of re-entering it.
        kaedTawsyaFromText(c.tawsya_ka2ed as string | null),
        // لشغل وظيفة: snapshot the imported target post (ACTIV_NOTE) per candidate.
        c.activ_note || null,
      ]
    );
  });

  saveDB();
  res.json({ loaded: eligible.length, message: `تم تحميل ${eligible.length} ضابط` });
});

// بنود التقييم لهذه اللجنة (تُنسخ من القالب تلقائياً إن كانت فارغة).
router.get('/:id/eval-items', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) { res.status(400).json({ error: 'معرف اللجنة غير صحيح' }); return; }
  const q = 'SELECT id, serial, name, max_degree, kind, source FROM committee_eval_items WHERE committee_id = ? ORDER BY serial, id';
  let items = mapRows(db.exec(q, [committeeId]));
  if (!items.length) { copyEvalTemplate(db, committeeId); saveDB(); items = mapRows(db.exec(q, [committeeId])); }
  res.json(items);
});

// «تحميل البنود»: re-copy the default template into this committee (replace).
router.post('/:id/load-items', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) { res.status(400).json({ error: 'معرف اللجنة غير صحيح' }); return; }
  const n = copyEvalTemplate(db, committeeId);
  saveDB();
  res.json({ loaded: n, message: `تم تحميل ${n} بند` });
});

// Update this committee's بنود (name/max per item). Body: { items: [{ id, name?, max_degree }] }.
router.put('/:id/eval-items', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!Number.isInteger(committeeId) || !items.length) { res.status(400).json({ error: 'بيانات غير صحيحة' }); return; }
  for (const it of items) {
    const iid = Number(it?.id);
    if (!Number.isInteger(iid)) continue;
    const max = it?.max_degree === null || it?.max_degree === '' ? 0 : Number(it.max_degree);
    const m = Number.isFinite(max) && max >= 0 ? max : 0;
    if (it?.name != null) {
      db.run('UPDATE committee_eval_items SET name = ?, max_degree = ? WHERE id = ? AND committee_id = ?',
        [String(it.name), m, iid, committeeId]);
    } else {
      db.run('UPDATE committee_eval_items SET max_degree = ? WHERE id = ? AND committee_id = ?',
        [m, iid, committeeId]);
    }
  }
  saveDB();
  res.json(mapRows(db.exec(
    'SELECT id, serial, name, max_degree, kind, source FROM committee_eval_items WHERE committee_id = ? ORDER BY serial, id',
    [committeeId]
  )));
});

// List committee officers with optional KIND and bulletin-rank filters.
router.get('/:id/officers', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const kind = Number(req.query.kind) || 5;
  const lagnaTypeCode = req.query.lagna_type_code != null ? Number(req.query.lagna_type_code) : 1000;

  const clauses = ['co.committee_id = ?'];
  const params: any[] = [committeeId];

  // KIND buckets mirror the legacy EVAL_LAGNA_OFF where-clause.
  if (kind === 1) clauses.push('o.kind_code IN (1,4) AND COALESCE(o.spec_branch_code,0) NOT IN (6,7)');
  else if (kind === 2) clauses.push('o.kind_code = 2');
  else if (kind === 3) clauses.push('o.kind_code IN (3,7)');
  else if (kind === 4) clauses.push('o.kind_code = 1 AND COALESCE(o.spec_branch_code,0) IN (6,7)');

  if (lagnaTypeCode !== 1000) {
    clauses.push('co.l_lagna_type_c = ?');
    params.push(lagnaTypeCode);
  }

  const officers = mapRows(db.exec(
     `SELECT co.officer_id, co.serial, co.officer_name, co.rank_name,
            co.akdam_no, co.akdam_rep, co.l_lagna_type_c, co.estifa, co.estifa_auto,
            COALESCE(co.target_job, o.activ_note) AS target_job, co.interview_date,
            lt.taraky_n as lagna_type_name,
            o.kind_code, o.spec_branch_code,
            co.category_id, cat.name AS category_name
     FROM committee_officers co
     JOIN officers o ON co.officer_id = o.id
     LEFT JOIN l_lagna_type lt ON co.l_lagna_type_c = lt.taraky_c
     LEFT JOIN officer_categories cat ON cat.id = co.category_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY co.serial`,
    params
  ));

  res.json(officers);
});

// Reorder officers: `order` is the officers in their new display order -> serial = index+1.
// Each entry is { officer_id, ta3n_type }, because an edarya officer can be registered under
// several case types and each of those is its own row. Defined before /:id/officers/:officerId
// so "reorder" isn't captured as :officerId. Every officer query orders by serial, so this
// drives the session list, the member voting order and the printed reports alike. A drag only
// reorders officers inside their ترتيب اللجنة category; the categories keep their order.
router.patch('/:id/officers/reorder', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const { order } = req.body;
  if (!Number.isInteger(committeeId) || !Array.isArray(order)) {
    res.status(400).json({ error: 'بيانات غير صحيحة' });
    return;
  }

  order.forEach((entry: any, i: number) => {
    const officerId = Number(entry?.officer_id ?? entry);
    if (!Number.isInteger(officerId)) return;
    const ta3nType = entry?.ta3n_type != null ? Number(entry.ta3n_type) : null;
    if (ta3nType != null && Number.isInteger(ta3nType)) {
      db.run(
        'UPDATE committee_officers SET serial = ? WHERE committee_id = ? AND officer_id = ? AND ta3n_type = ?',
        [i + 1, committeeId, officerId, ta3nType]
      );
    } else {
      db.run(
        'UPDATE committee_officers SET serial = ? WHERE committee_id = ? AND officer_id = ?',
        [i + 1, committeeId, officerId]
      );
    }
  });
  resequenceByCategory(db, committeeId);

  saveDB();
  res.json({ message: 'تم تحديث الترتيب' });
});

// Update a committee officer's bulletin rank and/or session flags.
router.patch('/:id/officers/:officerId', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const officerId = Number(req.params.officerId);

  if (!Number.isInteger(committeeId) || !Number.isInteger(officerId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }

  const body = req.body;
  // Optional ta3n_type scoping (edarya has multiple rows per officer).
  const ta3nType = body.ta3n_type != null ? Number(body.ta3n_type) : null;

  const updates: string[] = [];
  const params: any[] = [];

  for (const field of ['done', 'hidden', 'attendance', 'dispute', 'dont_print', 'apology', 'notes']) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(body[field] ? 1 : 0);
    }
  }
  if (body.kaed_tawsya !== undefined) {
    updates.push('kaed_tawsya = ?');
    params.push(body.kaed_tawsya === null || body.kaed_tawsya === '' ? null : Number(body.kaed_tawsya));
  }
  if (body.l_lagna_type_c !== undefined) {
    updates.push('l_lagna_type_c = ?');
    params.push(body.l_lagna_type_c ?? null);
  }
  if (body.estifa !== undefined) {
    updates.push('estifa = ?');
    params.push(body.estifa === null || body.estifa === '' ? null : Number(body.estifa));
  }
  // التمثيل العسكري candidate fields.
  if (body.target_job !== undefined) {
    updates.push('target_job = ?');
    params.push(body.target_job === null || body.target_job === '' ? null : String(body.target_job));
  }
  if (body.interview_date !== undefined) {
    updates.push('interview_date = ?');
    params.push(body.interview_date === null || body.interview_date === '' ? null : String(body.interview_date));
  }
  // ترتيب اللجنة: null clears the officer's category; otherwise it must be an existing one.
  if (body.category_id !== undefined) {
    const categoryId = body.category_id === null || body.category_id === '' ? null : Number(body.category_id);
    if (categoryId != null && (!Number.isInteger(categoryId)
      || !mapRows(db.exec('SELECT 1 FROM officer_categories WHERE id = ?', [categoryId])).length)) {
      res.status(400).json({ error: 'الترتيب غير موجود' });
      return;
    }
    updates.push('category_id = ?');
    params.push(categoryId);
  }

  if (!updates.length) {
    res.status(400).json({ error: 'لا توجد حقول للتحديث' });
    return;
  }

  const scope = ta3nType != null ? 'AND ta3n_type = ?' : '';
  const existing = mapRows(db.exec(
    `SELECT id FROM committee_officers WHERE committee_id = ? AND officer_id = ? ${scope}`,
    ta3nType != null ? [committeeId, officerId, ta3nType] : [committeeId, officerId]
  ));
  if (!existing.length) {
    res.status(404).json({ error: 'الضابط غير موجود في اللجنة' });
    return;
  }

  params.push(committeeId, officerId);
  if (ta3nType != null) params.push(ta3nType);
  db.run(
    `UPDATE committee_officers SET ${updates.join(', ')} WHERE committee_id = ? AND officer_id = ? ${scope}`,
    params
  );
  // A new category moves the officer into its group, so المسلسل follows.
  if (body.category_id !== undefined) resequenceByCategory(db, committeeId);
  saveDB();
  res.json({ message: 'تم التحديث' });
});

// Session grid (ترتيب العرض): all committee officers with their status flags, in session order.
router.get('/:id/session-officers', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const officers = mapRows(db.exec(
    `SELECT co.officer_id, co.serial, co.officer_name, co.rank_name, co.akdam_no, co.akdam_rep,
            co.is_active, co.done, co.hidden, co.attendance, co.dispute, co.dont_print, co.kaed_tawsya,
            co.ta3n_type, co.apology, co.notes, co.apology_reason,
            co.notes_text, co.notes_retirement_date, co.notes_retirement_reason,
            COALESCE(co.target_job, o.activ_note) AS target_job, co.interview_date,
            co.category_id, cat.name AS category_name
     FROM committee_officers co
     JOIN officers o ON o.id = co.officer_id
     LEFT JOIN officer_categories cat ON cat.id = co.category_id
     WHERE co.committee_id = ?
     ORDER BY ${SESSION_ORDER_BY}`,
    [committeeId]
  ));

  res.json(officers);
});

// "عرض الضباط": initialize voting records for each included member x officer.
router.post('/:id/show-officers', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const members = mapRows(db.exec(
    'SELECT user_id FROM committee_member_assignments WHERE committee_id = ? AND included = 1',
    [committeeId]
  ));
  const officers = mapRows(db.exec(
    'SELECT officer_id, ta3n_type FROM committee_officers WHERE committee_id = ?',
    [committeeId]
  ));

  if (!members.length || !officers.length) {
    res.status(400).json({ error: 'يجب تحميل الأعضاء والضباط أولاً' });
    return;
  }

  for (const m of members) {
    for (const o of officers) {
      db.run(
        `INSERT OR IGNORE INTO member_votes
           (committee_id, user_id, officer_id, ta3n_type, eval_state, user_opinion)
         VALUES (?, ?, ?, ?, 0, 2)`,
        [committeeId, m.user_id, o.officer_id, o.ta3n_type ?? 0]
      );
    }
  }
  saveDB();

  const total = mapRows(db.exec(
    'SELECT COUNT(*) as c FROM member_votes WHERE committee_id = ?',
    [committeeId]
  ))[0].c;

  res.json({
    members: members.length,
    officers: officers.length,
    votes: total,
    message: `تم تجهيز التصويت (${members.length} عضو × ${officers.length} ضابط)`,
  });
});

// "منتظر": mark one officer active (single-active per committee).
router.post('/:id/officers/:officerId/active', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const officerId = Number(req.params.officerId);
  const ta3nType = req.body?.ta3n_type != null ? Number(req.body.ta3n_type) : null;
  if (!Number.isInteger(committeeId) || !Number.isInteger(officerId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }

  const scope = ta3nType != null ? 'AND ta3n_type = ?' : '';
  const scopeParams = ta3nType != null ? [committeeId, officerId, ta3nType] : [committeeId, officerId];

  const row = mapRows(db.exec(
    `SELECT done FROM committee_officers WHERE committee_id = ? AND officer_id = ? ${scope}`,
    scopeParams
  ))[0];
  if (!row) {
    res.status(404).json({ error: 'الضابط غير موجود في اللجنة' });
    return;
  }
  if (row.done === 1) {
    res.status(400).json({ error: 'تم التصويت على الضابط بالفعل - لا يمكن جعله منتظراً' });
    return;
  }

  db.run('UPDATE committee_officers SET is_active = 0 WHERE committee_id = ?', [committeeId]);
  db.run(
    `UPDATE committee_officers SET is_active = 1 WHERE committee_id = ? AND officer_id = ? ${scope}`,
    scopeParams
  );
  saveDB();
  res.json({ message: 'تم التحديث' });
});

// Bulk session actions over the whole committee.
router.post('/:id/officers/bulk', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const { action } = req.body;
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  switch (action) {
    case 'done-all':
      db.run('UPDATE committee_officers SET done = 1 WHERE committee_id = ?', [committeeId]);
      break;
    case 'reset-done':
      db.run('UPDATE committee_officers SET done = 0 WHERE committee_id = ?', [committeeId]);
      break;
    case 'hide-all':
      db.run('UPDATE committee_officers SET hidden = 1 WHERE committee_id = ?', [committeeId]);
      break;
    case 'reset-done-disputes':
      backupCommittee(committeeId);
      db.run(
        'UPDATE committee_officers SET done = 0 WHERE committee_id = ? AND dispute = 1',
        [committeeId]
      );
      break;
    // "بدء من جديد": wipe the whole session back to just-loaded — every member vote cleared and
    // every officer's done / active / dispute / decision reset. Loaded officers, members and their
    // registration stay. A backup is taken first so it is recoverable.
    case 'reset-session':
      backupCommittee(committeeId);
      db.run('UPDATE member_votes SET user_opinion = 2, eval_state = 0 WHERE committee_id = ?', [committeeId]);
      db.run(
        `UPDATE committee_officers
         SET done = 0, is_active = 0, dispute = 0, final_eval = NULL, dont_print = 0
         WHERE committee_id = ?`,
        [committeeId]
      );
      // If the committee was already ended (إنهاء اللجنة → completed), un-lock it back to draft so it
      // can be run again; otherwise it stays "completed" and the reset appears to do nothing.
      db.run("UPDATE committees SET status = 'draft' WHERE id = ? AND status = 'completed'", [committeeId]);
      // The rerun shows every category's intro screen again.
      db.run('DELETE FROM committee_category_intros WHERE committee_id = ?', [committeeId]);
      break;
    // "حذف تقييمات الأعضاء": clear every member's بند scores + votes so the evaluation can be redone,
    // and re-open the officers (done / final decision reset). A backup is taken first.
    case 'reset-evaluations':
      backupCommittee(committeeId);
      db.run('DELETE FROM member_item_scores WHERE committee_id = ?', [committeeId]);
      db.run('UPDATE member_votes SET user_opinion = 2, eval_state = 0 WHERE committee_id = ?', [committeeId]);
      db.run('UPDATE committee_officers SET done = 0, final_eval = NULL WHERE committee_id = ?', [committeeId]);
      db.run("UPDATE committees SET status = 'draft' WHERE id = ? AND status = 'completed'", [committeeId]);
      db.run('DELETE FROM committee_category_intros WHERE committee_id = ?', [committeeId]);
      break;
    default:
      res.status(400).json({ error: 'إجراء غير معروف' });
      return;
  }
  saveDB();
  res.json({ message: 'تم التحديث' });
});

// Voting-summary report data: one card per officer, members as rows, votes per committee type.
router.get('/:id/reports/voting-summary', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const committee = mapRows(db.exec(
    `SELECT c.*, cat.cat_n as lagna_cat_name
     FROM committees c
     LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c
     WHERE c.id = ?`,
    [committeeId]
  ))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }

  const members = mapRows(db.exec(
    `SELECT cma.user_id, cma.serial, cma.name_snapshot, cma.rank_snapshot, u.username
     FROM committee_member_assignments cma
     JOIN users u ON cma.user_id = u.id
     WHERE cma.committee_id = ? AND cma.included = 1
     ORDER BY cma.serial`,
    [committeeId]
  ));

  const officersRaw = mapRows(db.exec(
    `SELECT co.officer_id, co.serial, co.akdam_no, co.akdam_rep, co.rank_name,
            co.officer_name, co.l_lagna_type_c, co.final_eval,
            lt.taraky_n as taraky_n
     FROM committee_officers co
     LEFT JOIN l_lagna_type lt ON co.l_lagna_type_c = lt.taraky_c
     WHERE co.committee_id = ?
     ORDER BY co.serial`,
    [committeeId]
  ));

  const officers = officersRaw.map(o => ({
    ...o,
    decision: tamseelDecision(o.final_eval as string | null),
  }));

  const votes = mapRows(db.exec(
    'SELECT officer_id, user_id, user_opinion FROM member_votes WHERE committee_id = ?',
    [committeeId]
  ));

  res.json({ committee, members, officers, votes });
});

// بطاقة تقييم أعضاء اللجنة (printable): every officer's members×بنود score matrix with the computed
// بنود (مسير الخدمة % + لغة إنجليزية), each member's total/نسبة, the averages, and the final
// evaluation + توصية. Built in one pass (bulk queries) for the print report.
router.get('/:id/reports/member-scores', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) { res.status(400).json({ error: 'معرف اللجنة غير صحيح' }); return; }

  const committee = mapRows(db.exec(
    `SELECT c.*, cat.cat_n as lagna_cat_name FROM committees c
     LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c WHERE c.id = ?`,
    [committeeId]
  ))[0];
  if (!committee) { res.status(404).json({ error: 'اللجنة غير موجودة' }); return; }

  const members = mapRows(db.exec(
    `SELECT cma.user_id, cma.serial, cma.name_snapshot AS name, cma.rank_snapshot AS rank_name
     FROM committee_member_assignments cma WHERE cma.committee_id = ? AND cma.included = 1 ORDER BY cma.serial`,
    [committeeId]
  ));

  const items = mapRows(db.exec(
    'SELECT id, serial, name, max_degree, kind, source FROM committee_eval_items WHERE committee_id = ? ORDER BY serial, id',
    [committeeId]
  ));
  const totalMaxItems = items.reduce((s: number, it: any) => s + (Number(it.max_degree) || 0), 0);

  const officers = mapRows(db.exec(
    `SELECT officer_id, serial, officer_name, rank_name, akdam_no, akdam_rep, target_job,
            done, final_eval, kaed_tawsya
     FROM committee_officers WHERE committee_id = ? AND hidden = 0 ORDER BY serial`,
    [committeeId]
  ));

  const scoreMap = new Map<string, number>();
  for (const r of mapRows(db.exec(
    'SELECT officer_id, user_id, item_id, score FROM member_item_scores WHERE committee_id = ?', [committeeId]
  ))) if (r.score != null) scoreMap.set(`${r.officer_id}:${r.user_id}:${r.item_id}`, Number(r.score));

  const svcMap = new Map<number, any>();
  for (const s of mapRows(db.exec(
    `SELECT ss.officer_id, ss.pct, ss.english FROM officer_service_score ss
     JOIN committee_officers co ON co.officer_id = ss.officer_id WHERE co.committee_id = ?`, [committeeId]
  ))) svcMap.set(Number(s.officer_id), s);

  const votedSet = new Set<string>();
  for (const v of mapRows(db.exec(
    'SELECT officer_id, user_id FROM member_votes WHERE committee_id = ? AND eval_state = 1', [committeeId]
  ))) votedSet.add(`${v.officer_id}:${v.user_id}`);

  const officerCards = officers.map((o: any) => {
    const ss = svcMap.get(Number(o.officer_id));
    const servicePct = (ss?.pct ?? null) as number | null;
    const english = (ss?.english ?? null) as number | null;
    const computedVal = (it: any): number | null =>
      it.kind === 'computed' ? (it.source === 'english' ? english : servicePct) : null;

    const memberRows = members.map((m: any) => {
      const scores: Record<number, number | null> = {};
      let total = 0;
      for (const it of items) {
        const v = it.kind === 'computed'
          ? computedVal(it)
          : (scoreMap.has(`${o.officer_id}:${m.user_id}:${it.id}`) ? scoreMap.get(`${o.officer_id}:${m.user_id}:${it.id}`)! : null);
        scores[it.id] = v;
        total += Number(v) || 0;
      }
      const pct = totalMaxItems > 0 ? Math.round((total / totalMaxItems) * 1000) / 10 : 0;
      return {
        user_id: m.user_id, serial: m.serial, name: m.name, rank_name: m.rank_name,
        voted: votedSet.has(`${o.officer_id}:${m.user_id}`), scores, total, pct,
      };
    });

    const itemAvg: Record<number, number | null> = {};
    for (const it of items) {
      if (it.kind === 'computed') { itemAvg[it.id] = computedVal(it); continue; }
      const vals = memberRows.map((m: any) => m.scores[it.id]).filter((x: any): x is number => x != null);
      itemAvg[it.id] = vals.length
        ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    const votedRows = memberRows.filter((m: any) => m.voted);
    const avgTotal = votedRows.length
      ? Math.round((votedRows.reduce((a: number, m: any) => a + m.total, 0) / votedRows.length) * 10) / 10 : null;
    const overallPct = votedRows.length
      ? Math.round((votedRows.reduce((a: number, m: any) => a + m.pct, 0) / votedRows.length) * 10) / 10 : null;

    return {
      officer_id: o.officer_id, serial: o.serial, officer_name: o.officer_name, rank_name: o.rank_name,
      akdam_no: o.akdam_no, akdam_rep: o.akdam_rep, target_job: o.target_job, done: o.done,
      service_score_pct: servicePct, english_score: english,
      decision: tamseelDecision(o.final_eval), kaed_tawsya: o.kaed_tawsya ?? null,
      members: memberRows,
      averages: { items: itemAvg, total: avgTotal, overall_pct: overallPct },
    };
  });

  res.json({ committee, members, items, total_max: totalMaxItems, officers: officerCards });
});

// Report: officers the committee continued (final_eval=1) but who are غير مستوف (estifa=0).
router.get('/:id/reports/not-mstawfy', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const committee = mapRows(db.exec(
    `SELECT c.*, cat.cat_n as lagna_cat_name
     FROM committees c
     LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c
     WHERE c.id = ?`,
    [committeeId]
  ))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }

  // Officers the committee continued (final_eval=1) whose الاستيفاء (imported TARAKY_ESTIFA)
  // says غير مستوف.
  const continued = mapRows(db.exec(
    `SELECT co.officer_id, co.serial, co.akdam_no, co.akdam_rep, co.rank_name,
            co.officer_name, co.unit_name, co.job_name, co.l_lagna_type_c, lt.taraky_n,
            o.taraky_estifa
     FROM committee_officers co
     JOIN officers o ON o.id = co.officer_id
     LEFT JOIN l_lagna_type lt ON co.l_lagna_type_c = lt.taraky_c
     WHERE co.committee_id = ? AND co.hidden = 0 AND co.final_eval = '1'
     ORDER BY co.l_lagna_type_c, co.serial`,
    [committeeId]
  ));
  const officers = continued.filter(o => String(o.taraky_estifa || '').includes('غير مستوف'));

  res.json({ committee, officers });
});

// Decision-review data: per-officer decisions for the review screen (type-branched).
router.get('/:id/decisions', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const committee = mapRows(db.exec(
    `SELECT c.*, cat.cat_n as lagna_cat_name
     FROM committees c
     LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c
     WHERE c.id = ?`,
    [committeeId]
  ))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }

  const officers = mapRows(db.exec(
    `SELECT co.officer_id, co.serial, co.officer_name, co.rank_name, co.akdam_no, co.akdam_rep,
            co.l_lagna_type_c, co.final_eval, co.done, co.dispute, co.kaed_tawsya,
            co.ta3n_type, lt.taraky_n
     FROM committee_officers co
     LEFT JOIN l_lagna_type lt ON co.l_lagna_type_c = lt.taraky_c
     WHERE co.committee_id = ? AND co.hidden = 0
     ORDER BY co.serial`,
    [committeeId]
  ));

  const enriched = officers.map((o) => {
    const lagnaTypeC = o.l_lagna_type_c != null ? Number(o.l_lagna_type_c) : null;
    const d = calculateTagddedDecision(committeeId, o.officer_id as number, lagnaTypeC);
    // Stored final_eval is authoritative once set (احتساب النتائج / عكس القرار); fall
    // back to the live majority before it is computed, matching legacy DECISIONS_SUMMARY.
    const storedEval = [1, 2, -1, '1', '2', '-1'].includes(o.final_eval as any)
      ? Number(o.final_eval) : null;
    const code = storedEval ?? d.decision_code;
    const decision = code === 0 ? '' : tamseelDecision(code);
    return { ...o, ...d, decision, decision_code: code };
  });

  // Members + per-member opinions power the tagdded card's vote matrix.
  const members = mapRows(db.exec(
    `SELECT cma.user_id, cma.serial, cma.name_snapshot, cma.rank_snapshot, u.job_title, u.username
     FROM committee_member_assignments cma
     JOIN users u ON cma.user_id = u.id
     WHERE cma.committee_id = ? AND cma.included = 1
     ORDER BY cma.serial`,
    [committeeId]
  ));
  // ta3n_type is carried so the edarya card can key each vote to the officer's specific سبب العرض
  // (an officer registered under two cases keeps a separate vote per case). tagdded is always 0.
  const votes = mapRows(db.exec(
    'SELECT officer_id, ta3n_type, user_id, user_opinion FROM member_votes WHERE committee_id = ? AND user_opinion <> 2',
    [committeeId]
  ));

  // Tagdded: resolve the preliminary/main/commander chain and gather each level's votes.
  let levels: Record<string, number | null> | null = null;
  let levelVotes: Record<string, any[]> | null = null;
  if (committee.committee_type === 'tagdded') {
    // Resolve each chain level live by nashra_date (رئيسية=0, تمهيدية=1, القائد=2) rather than the
    // dormant prev_tamhidy_committee_id link, so the card's three columns always map to the نشرة.
    const nd = committee.nashra_date;
    const byLevel = (t: number): number | null =>
      nd == null ? null : ((mapRows(db.exec(
        "SELECT id FROM committees WHERE committee_type = 'tagdded' AND tamhidy = ? AND nashra_date = ? ORDER BY id DESC LIMIT 1",
        [t, nd]
      ))[0]?.id as number) ?? null);
    const mainId = byLevel(0);       // رئيسية
    const prelimId = byLevel(1);     // تمهيدية
    const commanderId = byLevel(2);  // القائد

    const votesFor = (cid: number | null) =>
      cid == null ? [] : mapRows(db.exec(
        'SELECT officer_id, user_id, user_opinion FROM member_votes WHERE committee_id = ? AND user_opinion <> 2',
        [cid]
      ));
    levels = { mainId, prelimId, commanderId };
    levelVotes = { main: votesFor(mainId), prelim: votesFor(prelimId), commander: votesFor(commanderId) };
  }

  res.json({ committee, officers: enriched, members, votes, levels, levelVotes });
});

// عكس القرار (reverse the final decision) - faithful port of DECISIONS_SUMMARY.CHANGE_DECISION.
// Flips committee_officers.final_eval (1<->2) and overwrites ONLY the commander (EVAL1) and
// deputy-commander (EVAL9) opinion votes to match the new decision (opinion 1 for يستمر,
// opinion 0 for إحالة). Other members untouched.
router.post('/:id/officers/:officerId/reverse-decision', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const officerId = Number(req.params.officerId);
  if (!Number.isInteger(committeeId) || !Number.isInteger(officerId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT * FROM committees WHERE id = ?', [committeeId]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  if (committee.committee_type !== 'tagdded') {
    res.status(400).json({ error: 'عكس القرار متاح للجان التجديد والترقي فقط' });
    return;
  }
  if (committee.status === 'completed') {
    res.status(400).json({ error: 'لا يمكن التعديل بعد إنهاء اللجنة' });
    return;
  }
  const officer = mapRows(db.exec(
    'SELECT officer_id, final_eval FROM committee_officers WHERE committee_id = ? AND officer_id = ?',
    [committeeId, officerId]
  ))[0];
  if (!officer) {
    res.status(404).json({ error: 'الضابط غير موجود في اللجنة' });
    return;
  }
  const currentEval = officer.final_eval === 1 || officer.final_eval === '1' ? 1
    : officer.final_eval === 2 || officer.final_eval === '2' ? 2 : null;
  if (currentEval === null) {
    res.status(400).json({ error: 'لا يمكن عكس قرار لم يتم احتسابه بعد' });
    return;
  }
  const newEval = currentEval === 1 ? 2 : 1;
  const newOpinion = newEval === 1 ? 1 : 0;
  const newState = newEval === 1 ? 1 : 2;

  // Commander + deputy seats present in this committee.
  const commanders = mapRows(db.exec(
    `SELECT u.id FROM users u
     JOIN committee_member_assignments cma ON cma.user_id = u.id
     WHERE cma.committee_id = ? AND cma.included = 1 AND u.username IN ('EVAL1', 'EVAL9')`,
    [committeeId]
  ));
  for (const c of commanders) {
    db.run(
      `INSERT INTO member_votes
         (committee_id, user_id, officer_id, ta3n_type, eval_state, user_opinion, voted_at)
       VALUES (?, ?, ?, 0, ?, ?, datetime('now'))
       ON CONFLICT(committee_id, user_id, officer_id, ta3n_type)
       DO UPDATE SET eval_state = excluded.eval_state, user_opinion = excluded.user_opinion,
                     voted_at = excluded.voted_at`,
      [committeeId, c.id, officerId, newState, newOpinion]
    );
  }

  db.run(
    'UPDATE committee_officers SET final_eval = ? WHERE committee_id = ? AND officer_id = ?',
    [String(newEval), committeeId, officerId]
  );
  saveDB();
  res.json({ message: 'تم عكس القرار', final_eval: newEval });
});

// Committee statistics: totals + breakdown by decision/promotion-type (tagdded)
// or by ta3n_type/result (edarya).
router.get('/:id/reports/statistics', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec(
    `SELECT c.*, cat.cat_n as lagna_cat_name
     FROM committees c LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c
     WHERE c.id = ?`,
    [committeeId]
  ))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }

  const officers = mapRows(db.exec(
    `SELECT co.officer_id, co.final_eval, co.l_lagna_type_c, co.ta3n_type, lt.taraky_n
     FROM committee_officers co
     LEFT JOIN l_lagna_type lt ON co.l_lagna_type_c = lt.taraky_c
     WHERE co.committee_id = ? AND co.hidden = 0`,
    [committeeId]
  ));
  const total = officers.length;

  if (committee.committee_type === 'edarya') {
    res.status(400).json({ error: 'إحصائيات اللجنة غير متاحة للجان الإدارية' });
    return;
  }

  // tagdded
  let cont = 0, refer = 0, undecided = 0;
  const byType: Record<string, any> = {};
  for (const o of officers) {
    const fe = o.final_eval != null && o.final_eval !== '' ? Number(o.final_eval) : null;
    if (fe === 1) cont += 1; else if (fe === 2) refer += 1; else undecided += 1;
    const k = (o.taraky_n as string) || 'غير محدد';
    const g = (byType[k] ||= { taraky_n: k, total: 0, cont: 0, refer: 0, undecided: 0 });
    g.total += 1;
    if (fe === 1) g.cont += 1; else if (fe === 2) g.refer += 1; else g.undecided += 1;
  }
  res.json({ committee, total, evaluated: cont + refer, cont, refer, undecided, byType: Object.values(byType) });
});

// Tagdded Members_Decisions_Summary (Retired_Summary_By_User.xml) — per selected member,
// the officers they recommended for referral (user_opinion=0), grouped by promotion type,
// each with the total count of members who agreed on referral.
router.get('/:id/reports/member-decisions', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const userId = Number(req.query.user_id);
  if (!Number.isInteger(committeeId) || !Number.isInteger(userId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec(
    `SELECT c.*, cat.cat_n as lagna_cat_name
     FROM committees c LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c
     WHERE c.id = ?`,
    [committeeId]
  ))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  const member = mapRows(db.exec(
    'SELECT id, display_name, job_title FROM users WHERE id = ?',
    [userId]
  ))[0] ?? null;

  const officers = mapRows(db.exec(
    `SELECT co.officer_id, co.serial, co.rank_name, co.officer_name, co.akdam_no, co.akdam_rep,
            co.unit_name, co.job_name, co.l_lagna_type_c, lt.taraky_n
     FROM member_votes mv
     JOIN committee_officers co
       ON co.committee_id = mv.committee_id AND co.officer_id = mv.officer_id
     LEFT JOIN l_lagna_type lt ON co.l_lagna_type_c = lt.taraky_c
     WHERE mv.committee_id = ? AND mv.user_id = ? AND mv.user_opinion = 0 AND co.hidden = 0
     ORDER BY co.l_lagna_type_c, co.serial`,
    [committeeId, userId]
  ));

  const groups: Record<string, any> = {};
  for (const o of officers) {
    const referral = (mapRows(db.exec(
      `SELECT COUNT(*) c FROM member_votes mv
       JOIN committee_member_assignments cma
         ON cma.committee_id = mv.committee_id AND cma.user_id = mv.user_id
       WHERE mv.committee_id = ? AND mv.officer_id = ? AND mv.user_opinion = 0 AND cma.included = 1`,
      [committeeId, o.officer_id]
    ))[0]?.c as number) ?? 0;
    const key = String(o.l_lagna_type_c ?? 0);
    const g = (groups[key] ||= { l_lagna_type_c: o.l_lagna_type_c, taraky_n: o.taraky_n || '', officers: [] });
    g.officers.push({
      officer_id: o.officer_id,
      serial: g.officers.length + 1,
      akdam: [o.akdam_no != null ? o.akdam_no : '', o.akdam_rep || ''].filter(String).join(' '),
      rank_name: o.rank_name,
      officer_name: o.officer_name,
      unit_job: [o.unit_name, o.job_name].filter(Boolean).join(' / '),
      referral_count: referral,
    });
  }

  res.json({ committee, member, groups: Object.values(groups) });
});

// Compute automatic استيفاء (estifa_auto) for every officer via the ported engine.
router.post('/:id/compute-estifa', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id, nashra_date FROM committees WHERE id = ?', [committeeId]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  if (!committee.nashra_date) {
    res.status(400).json({ error: 'لا يوجد تاريخ نشرة للجنة' });
    return;
  }

  const officers = mapRows(db.exec(
    `SELECT co.officer_id, o.taraky_estifa
     FROM committee_officers co JOIN officers o ON o.id = co.officer_id
     WHERE co.committee_id = ? AND co.hidden = 0`,
    [committeeId]
  ));
  let mostawf = 0;
  for (const o of officers) {
    // استيفاء now comes from the imported TARAKY_ESTIFA text, not the computed engine.
    const v = o.taraky_estifa ? (String(o.taraky_estifa).includes('غير مستوف') ? 0 : 1) : null;
    db.run(
      'UPDATE committee_officers SET estifa_auto = ? WHERE committee_id = ? AND officer_id = ?',
      [v, committeeId, o.officer_id]
    );
    if (v === 1) mostawf++;
  }
  saveDB();
  res.json({
    total: officers.length,
    mostawf,
    gher: officers.length - mostawf,
    message: `تم احتساب الاستيفاء لـ ${officers.length} ضابط`,
  });
});

// Remove an officer from a committee. Edarya scopes by ta3n_type (an officer may be registered
// under several أسباب عرض, each its own row); tagdded omits it and drops the single loaded row.
// Serves both the edarya "حذف" on تسجيل الضباط and removing a wrongly-loaded tagdded officer
// before the committee starts.
router.delete('/:id/officers/:officerId', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.id);
  const officerId = Number(req.params.officerId);
  const ta3nType = req.query.ta3n_type != null ? Number(req.query.ta3n_type) : null;

  if (!Number.isInteger(committeeId) || !Number.isInteger(officerId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }

  const committee = mapRows(db.exec('SELECT id, is_active, status FROM committees WHERE id = ?', [committeeId]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  // Never pull an officer out from under a live session (it would wipe cast votes mid-vote).
  if (committee.is_active === 1 || committee.status === 'active') {
    res.status(400).json({ error: 'لا يمكن حذف ضابط أثناء جلسة نشطة - أوقف الجلسة أولاً' });
    return;
  }

  // The case sub-records and any votes already cast go with the row, otherwise re-registering the
  // same officer under the same سبب العرض would resurrect the previous case's values/votes.
  if (ta3nType != null) {
    db.run('DELETE FROM committee_officers WHERE committee_id = ? AND officer_id = ? AND ta3n_type = ?',
      [committeeId, officerId, ta3nType]);
    db.run('DELETE FROM member_votes WHERE committee_id = ? AND officer_id = ? AND ta3n_type = ?',
      [committeeId, officerId, ta3nType]);
  } else {
    db.run('DELETE FROM committee_officers WHERE committee_id = ? AND officer_id = ?',
      [committeeId, officerId]);
    db.run('DELETE FROM member_votes WHERE committee_id = ? AND officer_id = ?',
      [committeeId, officerId]);
  }

  // Close the gap left in the display order so serials stay 1..N (every officer query orders by
  // serial: the بيانات الضباط list, ترتيب العرض, the member voting order and the reports).
  const remaining = mapRows(db.exec(
    'SELECT officer_id, ta3n_type FROM committee_officers WHERE committee_id = ? ORDER BY serial',
    [committeeId]
  ));
  remaining.forEach((r: any, i: number) => {
    if (r.ta3n_type != null) {
      db.run('UPDATE committee_officers SET serial = ? WHERE committee_id = ? AND officer_id = ? AND ta3n_type = ?',
        [i + 1, committeeId, r.officer_id, r.ta3n_type]);
    } else {
      db.run('UPDATE committee_officers SET serial = ? WHERE committee_id = ? AND officer_id = ?',
        [i + 1, committeeId, r.officer_id]);
    }
  });

  saveDB();
  res.json({ message: 'تم الحذف' });
});

// Start the live voting session: exactly one committee is active at a time.
router.post('/:id/activate', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id, status FROM committees WHERE id = ?', [id]));
  if (!committee.length) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  // A finished committee is locked: it can never be re-opened for a live session.
  if (committee[0].status === 'completed') {
    res.status(400).json({ error: 'اللجنة منتهية - لا يمكن بدء الجلسة مرة أخرى' });
    return;
  }
  // Single live session: take any other committee offline first.
  db.run('UPDATE committees SET is_active = 0 WHERE is_active = 1');
  db.run("UPDATE committees SET status = 'draft' WHERE status = 'active' AND id <> ?", [id]);
  db.run("UPDATE committees SET is_active = 1, status = 'active' WHERE id = ?", [id]);
  saveDB();
  res.json({ message: 'تم بدء الجلسة' });
});

// Stop the live voting session (members can no longer reach it).
router.post('/:id/deactivate', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  // A finished committee stays finished; only an active/draft session drops back to draft.
  db.run(
    "UPDATE committees SET is_active = 0, status = CASE WHEN status = 'completed' THEN status ELSE 'draft' END WHERE id = ?",
    [id]
  );
  saveDB();
  res.json({ message: 'تم إيقاف الجلسة' });
});

// Take a manual snapshot of the committee ("أخذ نسخة احتياطية").
router.post('/:id/backup', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id FROM committees WHERE id = ?', [id]));
  if (!committee.length) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  const backupId = backupCommittee(id);
  saveDB();
  res.json({ backup_id: backupId, message: 'تم حفظ نسخة احتياطية' });
});

// List a committee's snapshots (newest first) for the restore panel.
router.get('/:id/backups', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id FROM committees WHERE id = ?', [id]));
  if (!committee.length) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  res.json(listBackups(id));
});

// Restore a committee from a snapshot (full point-in-time; refused while active).
router.post('/:id/restore', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  const backupId = Number(req.body?.backup_id);
  if (!Number.isInteger(id) || !Number.isInteger(backupId)) {
    res.status(400).json({ error: 'بيانات غير صحيحة' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id, is_active, status FROM committees WHERE id = ?', [id]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  if (committee.is_active === 1 || committee.status === 'active') {
    res.status(400).json({ error: 'لا يمكن الاسترجاع للجنة نشطة - أوقف الجلسة أولاً' });
    return;
  }
  if (!restoreCommittee(id, backupId)) {
    res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة' });
    return;
  }
  saveDB();
  res.json({ message: 'تم استرجاع اللجنة من النسخة الاحتياطية' });
});

// Finalize the committee: snapshot, mark completed, and take it offline.
router.post('/:id/complete', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  const committee = mapRows(db.exec('SELECT id, status FROM committees WHERE id = ?', [id]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  const backupId = backupCommittee(id);
  // Auto-احتساب on finalize: store any officer's decision that was never computed so the chain
  // hint and reports always have it. onlyUnset preserves manual احتساب / عكس القرار; no-op for edarya.
  finalizeTagddedDecisions(id, true);
  db.run("UPDATE committees SET status = 'completed', is_active = 0 WHERE id = ?", [id]);
  saveDB();
  res.json({ backup_id: backupId, message: 'تم إنهاء اللجنة' });
});

// Delete a committee and all of its per-committee records (member accounts are global and kept).
router.delete('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const committee = mapRows(db.exec('SELECT id, is_active, status FROM committees WHERE id = ?', [id]))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  if (committee.is_active === 1 || committee.status === 'active') {
    res.status(400).json({ error: 'لا يمكن حذف لجنة نشطة - أوقف الجلسة أولاً' });
    return;
  }

  db.run('DELETE FROM member_votes WHERE committee_id = ?', [id]);
  db.run('DELETE FROM committee_member_assignments WHERE committee_id = ?', [id]);
  db.run('DELETE FROM committee_officers WHERE committee_id = ?', [id]);
  db.run('DELETE FROM committee_category_intros WHERE committee_id = ?', [id]);
  db.run('DELETE FROM committee_backups WHERE committee_id = ?', [id]);
  // Break the tamhidy back-reference from any main committee that pointed here.
  db.run('UPDATE committees SET prev_tamhidy_committee_id = NULL WHERE prev_tamhidy_committee_id = ?', [id]);
  db.run('DELETE FROM committees WHERE id = ?', [id]);
  saveDB();

  res.json({ message: 'تم حذف اللجنة' });
});

export default router;
