import { Router, Response } from 'express';
import { getDB, saveDB } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { resequenceOpenCommittees } from '../services/sessionOrder.js';

// ترتيب اللجنة: the global list of officer categories (e.g. ملحق عسكري). A committee officer points
// at one through committee_officers.category_id. The list's order (position) is the order every
// committee's session presents the categories in.
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

// Officers holding the category in a committee that has not finished (draft or running). While
// any exist the value cannot be deleted.
const IN_USE_SQL =
  `SELECT COUNT(*) FROM committee_officers co
   JOIN committees c ON c.id = co.committee_id
   WHERE co.category_id = cat.id AND c.status IN ('draft', 'active')`;

const cleanName = (raw: unknown): string => String(raw ?? '').replace(/\s+/g, ' ').trim();

function findCategory(db: any, id: number): Record<string, any> | undefined {
  return mapRows(db.exec(`SELECT cat.id, cat.name, (${IN_USE_SQL}) AS in_use FROM officer_categories cat WHERE cat.id = ?`, [id]))[0];
}

function listCategories(db: any): Record<string, any>[] {
  return mapRows(db.exec(
    `SELECT cat.id, cat.name, (${IN_USE_SQL}) AS in_use FROM officer_categories cat ORDER BY cat.position, cat.id`
  ));
}

function nameTaken(db: any, name: string, exceptId?: number): boolean {
  return mapRows(db.exec(
    'SELECT id FROM officer_categories WHERE name = ? AND id <> ?',
    [name, exceptId ?? -1]
  )).length > 0;
}

router.get('/', (_req: AuthRequest, res: Response) => {
  res.json(listCategories(getDB()));
});

router.post('/', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const name = cleanName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: 'اسم الترتيب مطلوب' });
    return;
  }
  if (nameTaken(db, name)) {
    res.status(409).json({ error: 'هذا الاسم موجود بالفعل' });
    return;
  }
  db.run(
    'INSERT INTO officer_categories (name, position) VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM officer_categories))',
    [name]
  );
  const id = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]);
  saveDB();
  res.status(201).json({ id, name, in_use: 0 });
});

// Save the presentation order: `category_ids` lists every category, first to last. Unfinished
// committees renumber their المسلسل to match. Defined before /:id so "order" isn't captured as an id.
router.put('/order', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const raw = req.body?.category_ids;
  const ids = Array.isArray(raw) ? raw.map(Number) : [];
  const existing = new Set(mapRows(db.exec('SELECT id FROM officer_categories')).map((r) => Number(r.id)));
  const complete = ids.length === existing.size
    && new Set(ids).size === ids.length
    && ids.every((id) => existing.has(id));
  if (!complete) {
    res.status(400).json({ error: 'قائمة الترتيب غير مكتملة، برجاء تحديث الصفحة والمحاولة مرة أخرى' });
    return;
  }
  ids.forEach((id, i) => db.run('UPDATE officer_categories SET position = ? WHERE id = ?', [i + 1, id]));
  resequenceOpenCommittees(db);
  saveDB();
  res.json(listCategories(db));
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !findCategory(db, id)) {
    res.status(404).json({ error: 'الترتيب غير موجود' });
    return;
  }
  const name = cleanName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: 'اسم الترتيب مطلوب' });
    return;
  }
  if (nameTaken(db, name, id)) {
    res.status(409).json({ error: 'هذا الاسم موجود بالفعل' });
    return;
  }
  db.run('UPDATE officer_categories SET name = ? WHERE id = ?', [name, id]);
  saveDB();
  res.json(findCategory(db, id));
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const id = Number(req.params.id);
  const category = Number.isInteger(id) ? findCategory(db, id) : undefined;
  if (!category) {
    res.status(404).json({ error: 'الترتيب غير موجود' });
    return;
  }
  if (Number(category.in_use) > 0) {
    res.status(409).json({ error: `لا يمكن حذف «${category.name}» لأنه مرتبط بضباط في لجنة لم تنتهِ بعد` });
    return;
  }
  // Only finished committees can still point at it; they simply lose the label.
  db.run('UPDATE committee_officers SET category_id = NULL WHERE category_id = ?', [id]);
  db.run('DELETE FROM committee_category_intros WHERE category_id = ?', [id]);
  db.run('DELETE FROM officer_categories WHERE id = ?', [id]);
  saveDB();
  res.json({ message: 'تم الحذف' });
});

export default router;
