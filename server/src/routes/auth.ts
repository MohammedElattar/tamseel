import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDB } from '../db/connection.js';
import { authenticate, signToken, AuthRequest, AuthUser } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req: AuthRequest, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
    return;
  }

  const db = getDB();
  const results = db.exec(
    `SELECT id, username, password_hash, role, display_name, officer_id, is_active, is_guest
     FROM users WHERE username = ?`,
    [username]
  );

  if (!results.length || !results[0].values.length) {
    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    return;
  }

  const row = results[0].values[0];
  const [id, uname, hash, role, display_name, officer_id, is_active, is_guest] = row;

  if (!is_active) {
    res.status(403).json({ error: 'الحساب غير مفعل' });
    return;
  }

  if (!bcrypt.compareSync(password as string, hash as string)) {
    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    return;
  }

  const user: AuthUser = {
    id: id as number,
    username: uname as string,
    role: role as 'admin' | 'member',
    display_name: display_name as string,
    officer_id: officer_id as number | undefined,
    is_guest: is_guest === 1,
  };

  const token = signToken(user);
  res.json({ token, user });
});

// Public: seats available for passwordless member quick-login. Prefer the active
// committee's included members (in seat order); fall back to all member accounts.
// Guest seats are never assigned to a committee, so they are appended separately and
// stay available whether or not a session is running.
router.get('/members', (_req: AuthRequest, res: Response) => {
  const db = getDB();
  const active = db.exec('SELECT id FROM committees WHERE is_active = 1 LIMIT 1');
  let rows;
  if (active.length && active[0].values.length) {
    const committeeId = active[0].values[0][0];
    rows = db.exec(
      `SELECT u.id, u.display_name, u.job_title, u.username
       FROM committee_member_assignments cma
       JOIN users u ON cma.user_id = u.id
       WHERE cma.committee_id = ? AND cma.included = 1 AND u.role = 'member' AND u.is_active = 1
       ORDER BY cma.serial`,
      [committeeId]
    );
  } else {
    rows = db.exec(
      `SELECT id, display_name, job_title, username
       FROM users WHERE role = 'member' AND is_active = 1 AND COALESCE(is_guest, 0) = 0
       ORDER BY id`
    );
  }
  const members = rows.length && rows[0].values.length
    ? rows[0].values.map((r: any[]) => ({
        id: r[0], display_name: r[1], job_title: r[2], username: r[3], is_guest: false,
      }))
    : [];

  const guestRows = db.exec(
    `SELECT id, display_name, username
     FROM users WHERE role = 'member' AND is_active = 1 AND is_guest = 1
     ORDER BY id`
  );
  const guests = guestRows.length && guestRows[0].values.length
    ? guestRows[0].values.map((r: any[]) => ({
        id: r[0], display_name: r[1], job_title: null, username: r[2], is_guest: true,
      }))
    : [];

  res.json([...members, ...guests]);
});

// Public: passwordless login for a selected member seat (members only).
router.post('/quick-login', (req: AuthRequest, res: Response) => {
  const userId = Number(req.body?.user_id);
  if (!Number.isInteger(userId)) {
    res.status(400).json({ error: 'اختيار غير صحيح' });
    return;
  }

  const db = getDB();
  const results = db.exec(
    `SELECT id, username, role, display_name, officer_id, is_active, is_guest
     FROM users WHERE id = ?`,
    [userId]
  );

  if (!results.length || !results[0].values.length) {
    res.status(404).json({ error: 'العضو غير موجود' });
    return;
  }

  const [id, uname, role, display_name, officer_id, is_active, is_guest] = results[0].values[0];

  if (role !== 'member') {
    res.status(403).json({ error: 'الدخول السريع متاح للأعضاء فقط' });
    return;
  }
  if (!is_active) {
    res.status(403).json({ error: 'الحساب غير مفعل' });
    return;
  }

  const user: AuthUser = {
    id: id as number,
    username: uname as string,
    role: role as 'admin' | 'member',
    display_name: display_name as string,
    officer_id: officer_id as number | undefined,
    is_guest: is_guest === 1,
  };

  const token = signToken(user);
  res.json({ token, user });
});

router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

export default router;
