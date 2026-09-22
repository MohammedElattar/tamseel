import bcrypt from 'bcryptjs';
import { COMMITTEE_PANEL } from '../config/committeePanel.js';

// Every panel member shares one default password (matches routes/members.ts and the seed).
const DEFAULT_MEMBER_PASSWORD = 'member123';

function mapRows(results: any[]): Record<string, any>[] {
  if (!results.length || !results[0].values.length) return [];
  const columns = results[0].columns;
  return results[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj;
  });
}

// Unify the Arabic orthographic variants that differ harmlessly between the imported
// MEMBERS.JOB_N and a panel seat's `position` (hamza on alef/waw/ya, alef-maqsura, ta-marbuta,
// diacritics, tatweel, and doubled spaces) so titles compare by meaning, not exact bytes.
export function normalizeArabic(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // harakat + superscript alef + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

// Collapse doubled spaces the dump carries (e.g. 'لواء  بحري أ.ح') for a clean stored value.
function tidy(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export interface PanelIdentity {
  name: string;
  rank: string;
  jobN: string;
  memberId: number | null;
}

export interface PanelMatchResult {
  identities: Map<string, PanelIdentity>; // slot -> resolved identity (matched seats only)
  unmatchedSeats: string[];               // panel positions with no member row
  unmatchedRows: string[];                // member JOB_N values that matched no seat
  total: number;                          // member rows seen
}

// Match the imported MEMBERS rows to the fixed EVAL panel seats by (normalized) job title.
// Each seat takes the first still-unused member row whose JOB_N normalizes to the seat's
// `position` or one of its `matchTitles`. Matching by title (not file order or the repeating
// MEMBERS.ID) keeps القائد/نائب القائد (EVAL1/EVAL9) on their special seats.
export function matchPanelMembers(db: any): PanelMatchResult {
  let rows: Record<string, any>[] = [];
  try {
    rows = mapRows(db.exec('SELECT rowid, member_id, full_rank, per_name, job_n FROM members'));
  } catch {
    rows = []; // members table absent (older DB before this import existed)
  }

  const identities = new Map<string, PanelIdentity>();
  const unmatchedSeats: string[] = [];
  const usedRow = new Set<number>();

  for (const seat of COMMITTEE_PANEL) {
    const keys = new Set([seat.position, ...(seat.matchTitles || [])].map(normalizeArabic));
    const idx = rows.findIndex((r, i) =>
      !usedRow.has(i) && r.job_n != null && keys.has(normalizeArabic(r.job_n)));
    if (idx < 0) {
      unmatchedSeats.push(seat.position);
      continue;
    }
    usedRow.add(idx);
    const r = rows[idx];
    identities.set(seat.slot, {
      name: tidy(r.per_name) || seat.name || seat.position,
      rank: tidy(r.full_rank) || seat.rank || '',
      jobN: tidy(r.job_n),
      memberId: typeof r.member_id === 'number' ? r.member_id : null,
    });
  }

  const unmatchedRows = rows
    .filter((_, i) => !usedRow.has(i))
    .map(r => tidy(r.job_n) || tidy(r.per_name))
    .filter(Boolean);

  return { identities, unmatchedSeats, unmatchedRows, total: rows.length };
}

// Convenience: just the slot -> identity map (used by "تحميل الأعضاء").
export function resolvePanelIdentities(db: any): Map<string, PanelIdentity> {
  return matchPanelMembers(db).identities;
}

// After a MEMBERS import, refresh the standing panel member accounts (the EVAL users the
// الأعضاء page manages) with the imported name + rank, so they show up immediately without
// waiting for a committee to be loaded. Upsert only — never wipes users (persistent table).
// The seat's canonical `position` stays the job_title; the imported JOB_N is only a match key.
export function syncStandingPanelMembers(db: any): number {
  const identities = resolvePanelIdentities(db);
  if (!identities.size) return 0;

  let synced = 0;
  for (const seat of COMMITTEE_PANEL) {
    const identity = identities.get(seat.slot);
    if (!identity) continue;

    const existing = mapRows(db.exec('SELECT id FROM users WHERE username = ?', [seat.slot]))[0];
    if (existing) {
      db.run(
        `UPDATE users
         SET display_name = ?, rank_name = ?, job_title = ?, job_code = ?
         WHERE id = ?`,
        [identity.name, identity.rank || null, seat.position, seat.jobCode, existing.id]
      );
    } else {
      db.run(
        `INSERT INTO users (username, password_hash, role, display_name, job_title, job_code, rank_name)
         VALUES (?, ?, 'member', ?, ?, ?, ?)`,
        [seat.slot, bcrypt.hashSync(DEFAULT_MEMBER_PASSWORD, 10),
         identity.name, seat.position, seat.jobCode, identity.rank || null]
      );
    }
    synced++;
  }
  return synced;
}
