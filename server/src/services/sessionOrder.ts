// ترتيب اللجنة: the order a committee's session presents its officers in — officers with a category
// first, category by category in the order set on the categories page, then the uncategorized
// ones; المسلسل orders the officers inside each group. Used by the member session (التالي/السابق)
// and the admin ترتيب العرض list alike. Expects committee_officers as `co` and a LEFT JOIN of
// officer_categories as `cat`.
export const SESSION_ORDER_BY =
  'CASE WHEN cat.id IS NULL THEN 1 ELSE 0 END, cat.position, cat.id, co.serial, co.id';

// Renumbers a committee's المسلسل 1..N in session order, so the numbers on every screen and report
// run category by category. Officers keep their relative order inside each category.
export function resequenceByCategory(db: any, committeeId: number): void {
  const res = db.exec(
    `SELECT co.id, co.serial FROM committee_officers co
     LEFT JOIN officer_categories cat ON cat.id = co.category_id
     WHERE co.committee_id = ?
     ORDER BY ${SESSION_ORDER_BY}`,
    [committeeId]
  );
  const rows: any[][] = res.length ? res[0].values : [];
  rows.forEach(([id, serial], i) => {
    if (serial !== i + 1) db.run('UPDATE committee_officers SET serial = ? WHERE id = ?', [i + 1, id]);
  });
}

// Every committee that hasn't finished (draft or running). A finished committee keeps the numbers
// it was run and printed with.
export function resequenceOpenCommittees(db: any): void {
  const res = db.exec("SELECT id FROM committees WHERE status IN ('draft', 'active')");
  (res.length ? res[0].values : []).forEach(([id]: any[]) => resequenceByCategory(db, Number(id)));
}
