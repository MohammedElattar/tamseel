import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDB, saveDB } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { COMMITTEE_PANEL } from '../config/committeePanel.js';

const router = Router();
router.use(authenticate);

const DEFAULT_MEMBER_PASSWORD = 'member123';
// Slot -> position in the fixed panel, for a stable "commanders first" ordering.
const PANEL_ORDER = new Map(COMMITTEE_PANEL.map((p, i) => [p.slot, i]));

function mapRows(results: any[]): Record<string, any>[] {
  if (!results.length || !results[0].values.length) return [];
  const columns = results[0].columns;
  return results[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

// All committee members (role='member'), managed entirely separately from officers. Rank is
// stored on the account; it falls back to the linked officer / latest committee snapshot for
// members that predate the rank column. committee_count lets the UI block deleting a member
// who is still assigned to a committee.
router.get('/', requireAdmin, (_req: AuthRequest, res: Response) => {
  const db = getDB();
  const rows = mapRows(db.exec(
    `SELECT u.id, u.username, u.display_name, u.job_title, u.is_active, u.is_guest,
            COALESCE(u.rank_name, o.full_rank, (
              SELECT cma2.rank_snapshot
              FROM committee_member_assignments cma2
              WHERE cma2.user_id = u.id AND cma2.rank_snapshot IS NOT NULL AND cma2.rank_snapshot <> ''
              ORDER BY cma2.id DESC LIMIT 1
            )) AS rank_name,
            (SELECT COUNT(*) FROM committee_member_assignments cma WHERE cma.user_id = u.id) AS committee_count
     FROM users u
     LEFT JOIN officers o ON o.id = u.officer_id
     WHERE u.role = 'member'`
  ));

  // Commanders (fixed panel) first in panel order, then other members, guest seats last.
  const bucket = (m: Record<string, any>) =>
    m.is_guest === 1 ? 2 : (PANEL_ORDER.has(m.username) ? 0 : 1);
  rows.sort((a, b) => {
    const ba = bucket(a), bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) return (PANEL_ORDER.get(a.username)! - PANEL_ORDER.get(b.username)!);
    return (a.id as number) - (b.id as number);
  });

  res.json(rows);
});

// Create a member account. The admin only supplies name / rank / job / active — the username
// is auto-generated and unique (EVAL_<id>) and every member shares one default password.
router.post('/', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const displayName = String(req.body?.display_name || '').trim();
  const rankName = req.body?.rank_name != null ? String(req.body.rank_name).trim() : '';
  const jobTitle = req.body?.job_title != null ? String(req.body.job_title).trim() : '';
  const isActive = req.body?.is_active === 0 || req.body?.is_active === false ? 0 : 1;

  if (!displayName) { res.status(400).json({ error: 'اسم العضو مطلوب' }); return; }

  // Insert with a temporary unique username, then set it to EVAL_<id> from the new row id
  // (the id isn't known until after the insert). All members share DEFAULT_MEMBER_PASSWORD.
  const hash = bcrypt.hashSync(DEFAULT_MEMBER_PASSWORD, 10);
  const tempUsername = `__pending_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  db.run(
    `INSERT INTO users (username, password_hash, role, display_name, job_title, rank_name, is_active)
     VALUES (?, ?, 'member', ?, ?, ?, ?)`,
    [tempUsername, hash, displayName, jobTitle || null, rankName || null, isActive]
  );
  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
  const username = `EVAL_${id}`;
  db.run('UPDATE users SET username = ? WHERE id = ?', [username, id]);
  saveDB();
  res.status(201).json({ id, username, message: 'تم إضافة العضو' });
});

// Update a member account (only the provided fields).
router.put('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'معرف غير صحيح' }); return; }

  const existing = mapRows(db.exec("SELECT id FROM users WHERE id = ? AND role = 'member'", [id]))[0];
  if (!existing) { res.status(404).json({ error: 'العضو غير موجود' }); return; }

  const body = req.body || {};
  const sets: string[] = [];
  const params: any[] = [];

  if (body.username != null) {
    const uname = String(body.username).trim();
    if (!uname) { res.status(400).json({ error: 'اسم المستخدم مطلوب' }); return; }
    if (mapRows(db.exec('SELECT id FROM users WHERE username = ? AND id <> ?', [uname, id])).length) {
      res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
      return;
    }
    sets.push('username = ?'); params.push(uname);
  }
  if (body.display_name != null) {
    const dn = String(body.display_name).trim();
    if (!dn) { res.status(400).json({ error: 'اسم العضو مطلوب' }); return; }
    sets.push('display_name = ?'); params.push(dn);
  }
  if (body.rank_name != null) { sets.push('rank_name = ?'); params.push(String(body.rank_name).trim() || null); }
  if (body.job_title != null) { sets.push('job_title = ?'); params.push(String(body.job_title).trim() || null); }
  if (body.is_active != null) { sets.push('is_active = ?'); params.push(body.is_active ? 1 : 0); }
  if (body.password != null && String(body.password).trim()) {
    sets.push('password_hash = ?'); params.push(bcrypt.hashSync(String(body.password).trim(), 10));
  }

  if (!sets.length) { res.json({ message: 'لا يوجد تغيير' }); return; }
  params.push(id);
  db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  saveDB();
  res.json({ message: 'تم تحديث العضو' });
});

// Delete a member account. Blocked while the member is assigned to any committee, so committee
// rosters and stored votes are never silently broken — remove them from the committee first.
router.delete('/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'معرف غير صحيح' }); return; }

  const existing = mapRows(db.exec("SELECT id FROM users WHERE id = ? AND role = 'member'", [id]))[0];
  if (!existing) { res.status(404).json({ error: 'العضو غير موجود' }); return; }

  const assigned = mapRows(db.exec(
    'SELECT 1 FROM committee_member_assignments WHERE user_id = ? LIMIT 1', [id]
  )).length > 0;
  if (assigned) {
    res.status(409).json({ error: 'العضو مُسجَّل في لجنة — أزِله من اللجنة أولاً ثم احذفه' });
    return;
  }

  db.run('DELETE FROM member_votes WHERE user_id = ?', [id]);
  db.run('DELETE FROM users WHERE id = ?', [id]);
  saveDB();
  res.json({ message: 'تم حذف العضو' });
});

export default router;
