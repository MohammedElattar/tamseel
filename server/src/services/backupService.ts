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

// Snapshot a committee and all of its per-committee records into committee_backups.
// Caller is responsible for saveDB() (so a backup + follow-up mutations persist together).
export function backupCommittee(committeeId: number): number {
  const db = getDB();
  const committee = mapRows(db.exec('SELECT * FROM committees WHERE id = ?', [committeeId]))[0];
  if (!committee) return 0;

  const snapshot = {
    version: 1,
    taken_at: new Date().toISOString(),
    committee,
    officers: mapRows(db.exec('SELECT * FROM committee_officers WHERE committee_id = ?', [committeeId])),
    members: mapRows(db.exec('SELECT * FROM committee_member_assignments WHERE committee_id = ?', [committeeId])),
    votes: mapRows(db.exec('SELECT * FROM member_votes WHERE committee_id = ?', [committeeId])),
  };

  db.run(
    'INSERT INTO committee_backups (committee_id, data_json) VALUES (?, ?)',
    [committeeId, JSON.stringify(snapshot)]
  );
  return db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
}

// Snapshots for a committee (newest first) with quick counts for the restore panel.
export function listBackups(committeeId: number): any[] {
  const db = getDB();
  const rows = mapRows(db.exec(
    'SELECT id, backup_date, data_json FROM committee_backups WHERE committee_id = ? ORDER BY id DESC',
    [committeeId]
  ));
  return rows.map((r) => {
    let officers = 0, members = 0, votes = 0;
    try {
      const s = JSON.parse(r.data_json as string);
      officers = (s.officers || []).length;
      members = (s.members || []).length;
      votes = (s.votes || []).filter((v: any) => v.user_opinion !== 2).length;
    } catch { /* ignore malformed */ }
    return { id: r.id, backup_date: r.backup_date, officers, members, votes };
  });
}

// Columns that currently exist on a table (so we never try to restore a retired column).
function tableColumns(db: ReturnType<typeof getDB>, table: string): Set<string> {
  const info = db.exec(`PRAGMA table_info(${table})`);
  const rows: any[] = info.length ? info[0].values : [];
  return new Set(rows.map((r: any[]) => r[1] as string));
}

// Insert a snapshot row into a fixed table, taking every column except id — and skipping any
// column no longer in the live schema (older backups may carry retired columns like degree).
function insertRow(db: ReturnType<typeof getDB>, table: string, row: Record<string, any>): void {
  const existing = tableColumns(db, table);
  const cols = Object.keys(row).filter((k) => k !== 'id' && existing.has(k));
  if (!cols.length) return;
  const placeholders = cols.map(() => '?').join(', ');
  db.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, cols.map((c) => row[c]));
}

// Committee params that a restore rolls back (identity/lifecycle columns are preserved).
const RESTORE_PARAMS = [
  'lagna_cat_c', 'lagna_date', 'nashra_date',
  'tamhidy', 'hide_decision', 'prev_tamhidy_committee_id',
];

// Full point-in-time restore: snapshot the current state (undo), then replace the
// committee's child rows and editable params from the chosen backup. Caller saveDB().
export function restoreCommittee(committeeId: number, backupId: number): boolean {
  const db = getDB();
  const row = mapRows(db.exec(
    'SELECT data_json FROM committee_backups WHERE id = ? AND committee_id = ?',
    [backupId, committeeId]
  ))[0];
  if (!row) return false;
  let snap: any;
  try { snap = JSON.parse(row.data_json as string); } catch { return false; }

  backupCommittee(committeeId); // safety snapshot so the restore is itself undoable

  db.run('DELETE FROM member_votes WHERE committee_id = ?', [committeeId]);
  db.run('DELETE FROM committee_member_assignments WHERE committee_id = ?', [committeeId]);
  db.run('DELETE FROM committee_officers WHERE committee_id = ?', [committeeId]);

  for (const o of (snap.officers || [])) insertRow(db, 'committee_officers', o);
  for (const m of (snap.members || [])) insertRow(db, 'committee_member_assignments', m);
  for (const v of (snap.votes || [])) insertRow(db, 'member_votes', v);

  if (snap.committee) {
    const sets: string[] = [];
    const params: any[] = [];
    for (const p of RESTORE_PARAMS) {
      if (p in snap.committee) { sets.push(`${p} = ?`); params.push(snap.committee[p]); }
    }
    if (sets.length) {
      params.push(committeeId);
      db.run(`UPDATE committees SET ${sets.join(', ')} WHERE id = ?`, params);
    }
  }
  return true;
}
