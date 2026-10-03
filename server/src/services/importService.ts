import { getDB } from '../db/connection.js';
import { arabizeTextColumn } from '../config/arabicText.js';

export interface ImportResult {
  table: string;
  count: number;
}

export interface ImportOutcome {
  results: ImportResult[];
  warnings: string[];
}

// 'replace' (default) wipes each matched target table and reloads it from the file — the
// quarterly refresh. 'append' adds the file's rows without deleting or truncating anything,
// so existing data is preserved; a primary-key clash then raises an error (see the INSERT verb
// below) instead of silently overwriting a row that must be kept.
export type ImportMode = 'replace' | 'append';

// Oracle table name (UPPER, schema prefix stripped) -> SQLite target table. The officer
// dumps the Navy provides map here, plus officer_children — an extra, system-managed table
// the app can also import (see PER_OFFICER_REPLACE). Every reference/lookup table (ranks,
// l_lagna_type, eval_lagna_cat, ta3n_types, grades, …) is seeded, not imported.
// الوظائف السابقة arrives under either OFFICERS_HOLDER_WAZYEF or JOBS.
export const TABLE_MAP: Record<string, string> = {
  ELASASY: 'officers',
  SECURITYS: 'officer_kafaa',
  GAZA: 'officer_punishments_geza',
  OFFICERS_HOLDER_WAZYEF: 'officer_holder_wazayef',
  JOBS: 'officer_holder_wazayef',
  BA3AST: 'officer_holder_paasat',
  SE7A: 'officer_holder_health',
  // التمثيل العسكري raw career sources for the مسير الخدمة score engine. The Navy dumps name
  // these OFF.TASHKEELAT / OFF.WISAM / OFF.TAHIL; ALL_KHADMA_PERIODS and OFFICER_TAHIL are
  // accepted aliases (source-table names) for the same targets.
  TASHKEELAT: 'officer_tashkeelat',
  ALL_KHADMA_PERIODS: 'officer_tashkeelat',
  WISAM: 'officer_medals',
  TAHIL: 'officer_qualification',
  OFFICER_TAHIL: 'officer_qualification',
  // الدراسات العلمية / التأهيل العسكري: denormalized officer-qualification dumps (text already
  // decoded), keyed by ID -> officer_id like the other child tables.
  TAHIL_3LMY: 'officer_tahil_3lmy',
  TAHIL_3ASKARY: 'officer_tahil_3askary',
  OFFICER_CHILDREN: 'officer_children',
  // The committee panel roster (senior commanders). Wiped and reloaded like the officer dumps,
  // then materialized onto the fixed EVAL seats by "تحميل الأعضاء" (see services/panelMembers).
  MEMBERS: 'members',
};

// Persistent, system-managed tables that can ALSO be edited by hand in the app. Unlike the
// imported dumps above, an import of one of these must NOT wipe the whole table (that would
// drop other officers' hand-entered rows). Instead it replaces only the officer_ids present
// in the uploaded file. officer_children is keyed by the stable officers.id and survives the
// quarterly officers wipe, so a children import is a targeted, per-officer replace.
const PER_OFFICER_REPLACE = new Set<string>(['officer_children']);

// Per-target column renames (Oracle col UPPER -> SQLite col). Only where a plain
// lowercase of the Oracle name would not match the SQLite column. Everything else
// auto-maps by lowercase, and Oracle ID/OFF_ID auto-maps to officer_id on child tables.
const COLUMN_MAP: Record<string, Record<string, string>> = {
  // ELASASY is now a denormalized text dump (rank/unit/job/speciality as text, plus the
  // pre-computed استيفاء/promotion results). Only MILITARY_NUMBER needs a rename to our
  // person_id (the officer's military number); every other column auto-maps by lowercase.
  officers: {
    MILITARY_NUMBER: 'person_id',
    // التمثيل العسكري ELASASY dump: text speciality, training year, and the arm code. The dump may
    // send SPEB_N alongside SPECIALITY (the same value); the first of the two is kept.
    SPEB_N: 'speciality',
    TRANING_YEAR: 'training_year',
    ARM_C: 'arm_code',
    // الحالة الاجتماعية arrives as the MARIT lookup's text. HEIGHT / WEIGHT / BOY_NO / GIRL_NO and
    // MOH_N (محل الإقامة) auto-map.
    MARIT_N: 'marital_status',
  },
  // الوظائف السابقة: المرتب is one column that arrives under either name (RAN_N_1 or
  // RAN_N_MRTB); both map to ran_n_mrtb. TO_DATE_ drops its trailing underscore to to_date.
  // Everything else auto-maps by lowercase.
  officer_holder_wazayef: {
    RAN_N_1: 'ran_n_mrtb',
    RAN_N_MRTB: 'ran_n_mrtb',
    TO_DATE_: 'to_date',
  },
  // MEMBERS.ID is the member's own id, not an officer_id — keep it as member_id so the generic
  // ID/OFF_ID → officer_id rule (used by the officer child tables) does not hijack it.
  members: {
    ID: 'member_id',
  },
};

// ---------------------------------------------------------------------------
// SQL parsing (Oracle INSERT statements from Toad / exp dumps)
// ---------------------------------------------------------------------------

interface ParsedInsert {
  table: string;
  columns: string[];
  rows: string[][];
}

// Split a script into statements on top-level ';', respecting single-quoted
// strings (with '' escaping) and skipping -- line and /* */ block comments.
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { cur += "'"; i++; continue; }
        inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (ch === ';') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// Read a balanced (...) group starting at str[start] === '(' (respects strings).
function readBalanced(str: string, start: number): { inner: string; end: number } {
  let depth = 0;
  let inner = '';
  let inStr = false;
  let i = start;
  for (; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      inner += ch;
      if (ch === "'") {
        if (str[i + 1] === "'") { inner += "'"; i++; continue; }
        inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; inner += ch; continue; }
    if (ch === '(') { depth++; if (depth === 1) continue; inner += ch; continue; }
    if (ch === ')') { depth--; if (depth === 0) { i++; break; } inner += ch; continue; }
    inner += ch;
  }
  return { inner, end: i };
}

// Split a VALUES tuple body by top-level commas (respects strings and nested parens).
function splitTuple(inner: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (inner[i + 1] === "'") { cur += "'"; i++; continue; }
        inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; cur += ch; continue; }
    if (ch === '(') { depth++; cur += ch; continue; }
    if (ch === ')') { depth--; cur += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

function parseInsert(stmt: string): ParsedInsert | null {
  const m = stmt.match(/INSERT\s+INTO\s+("?[A-Za-z0-9_$]+"?(?:\.\s*"?[A-Za-z0-9_$]+"?)?)/i);
  if (!m) return null;
  let idx = m.index! + m[0].length;
  const rawTable = m[1].replace(/["\s]/g, '');
  const table = rawTable.includes('.') ? rawTable.split('.').pop()! : rawTable;

  // Skip whitespace AND a stray trailing comma after the table name (some dumps emit
  // `Insert into OFF.SECURITYS,` before the column list).
  while (idx < stmt.length && /[\s,]/.test(stmt[idx])) idx++;

  let columns: string[] = [];
  if (stmt[idx] === '(') {
    const { inner, end } = readBalanced(stmt, idx);
    columns = inner.split(',').map(c => c.trim().replace(/"/g, ''));
    idx = end;
  }

  const vm = stmt.slice(idx).match(/\s*VALUES\s*/i);
  if (!vm) return null;
  idx += vm.index! + vm[0].length;

  const rows: string[][] = [];
  while (idx < stmt.length) {
    while (idx < stmt.length && /[\s,]/.test(stmt[idx])) idx++;
    if (stmt[idx] !== '(') break;
    const { inner, end } = readBalanced(stmt, idx);
    rows.push(splitTuple(inner));
    idx = end;
  }

  return { table, columns, rows };
}

// ---------------------------------------------------------------------------
// Value transforms
// ---------------------------------------------------------------------------

function pad2(s: string): string {
  return s.length === 1 ? '0' + s : s;
}

// Normalize an Oracle date literal to ISO YYYY-MM-DD (dates are stored as TEXT).
function parseOracleDate(value: string, format?: string): string {
  const val = value.trim();
  let m = val.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = val.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    const f = (format || '').toUpperCase();
    if (f.startsWith('MM')) return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
    return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  }
  return val;
}

function transformValue(raw: string): string | number | null {
  const v = raw.trim();
  if (v === '' || /^NULL$/i.test(v)) return null;

  const str = v.match(/^N?'([\s\S]*)'$/i);
  if (str) return str[1].replace(/''/g, "'");

  const dt = v.match(/^TO_(?:DATE|TIMESTAMP)\s*\(\s*'([^']*)'\s*(?:,\s*'([^']*)')?\s*\)$/i);
  if (dt) return parseOracleDate(dt[1], dt[2]);

  if (/^(?:HEXTORAW|TO_BLOB|EMPTY_BLOB|EMPTY_CLOB)\s*\(/i.test(v)) return null;

  if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(v)) return Number(v);

  return v;
}

// ---------------------------------------------------------------------------
// Column resolution
// ---------------------------------------------------------------------------

function getTableColumns(db: any, table: string): Set<string> {
  const set = new Set<string>();
  const r = db.exec(`PRAGMA table_info(${table})`);
  if (r.length) for (const row of r[0].values) set.add(String(row[1]));
  return set;
}

function resolveColumn(target: string, oracleCol: string, cols: Set<string>): string | null {
  const up = oracleCol.toUpperCase();
  const explicit = COLUMN_MAP[target]?.[up];
  if (explicit) return cols.has(explicit) ? explicit : null;
  // Oracle keys the officer by ID / OFF_ID on child tables; our schema uses officer_id.
  if ((up === 'ID' || up === 'OFF_ID') && cols.has('officer_id')) return 'officer_id';
  const lower = oracleCol.toLowerCase();
  if (cols.has(lower)) return lower;
  return null;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export function parseAndImport(sqlContent: string, mode: ImportMode = 'replace'): ImportOutcome {
  const db = getDB();
  const warnings: string[] = [];

  const grouped: { target: string; source: string; columns: string[]; rows: string[][] }[] = [];
  for (const stmt of splitStatements(sqlContent)) {
    const ins = parseInsert(stmt);
    if (!ins) continue;
    const target = TABLE_MAP[ins.table.toUpperCase()];
    if (!target) continue; // unmapped Oracle table -> ignore
    if (!ins.columns.length) {
      warnings.push(`تم تجاهل عبارة بدون قائمة أعمدة للجدول ${ins.table}`);
      continue;
    }
    grouped.push({ target, source: ins.table.toUpperCase(), columns: ins.columns, rows: ins.rows });
  }

  if (!grouped.length) return { results: [], warnings };

  const targetsPresent = [...new Set(grouped.map(g => g.target))];
  const counts: Record<string, number> = {};
  const skipped: Record<string, Set<string>> = {};
  const colCache: Record<string, Set<string>> = {};
  const stmtCache = new Map<string, any>();

  // Safety guard: only wipe/reload a target that has a real column match. officer_id
  // resolves for every table, so a mislabeled block (e.g. بعثات rows tagged SECURITYS)
  // would otherwise DELETE an unrelated table (officer_kafaa) then insert nothing. Require
  // at least one resolved column other than the officer key before touching the table.
  const resolvableTargets = new Set<string>();
  for (const g of grouped) {
    const cols = colCache[g.target] || (colCache[g.target] = getTableColumns(db, g.target));
    if (g.columns.some(oc => {
      const r = resolveColumn(g.target, oc, cols);
      return r != null && r !== 'officer_id';
    })) resolvableTargets.add(g.target);
  }
  for (const t of targetsPresent) {
    if (!resolvableTargets.has(t)) {
      warnings.push(mode === 'append'
        ? `تم تجاهل الجدول ${t}: أعمدته لا تطابق الجدول المستهدف`
        : `تم تجاهل الجدول ${t}: أعمدته لا تطابق الجدول المستهدف (لم يُمسح)`);
    }
  }

  db.run('PRAGMA foreign_keys = OFF');
  db.run('BEGIN');
  try {
    // Append mode preserves every existing row: skip the wipe entirely and just add the file's
    // rows below. Replace mode (the quarterly refresh) clears each matched target first.
    if (mode === 'replace') {
      for (const t of targetsPresent) {
        if (!resolvableTargets.has(t)) continue;
        if (PER_OFFICER_REPLACE.has(t)) continue; // replaced per officer below, not wiped whole
        db.run(`DELETE FROM ${t}`);
        counts[t] = 0;
      }

      // Per-officer replace: delete existing rows only for the officer_ids present in the file,
      // so other officers' rows (including ones entered by hand in the app) survive the import.
      for (const t of targetsPresent) {
        if (!resolvableTargets.has(t) || !PER_OFFICER_REPLACE.has(t)) continue;
        const cols = colCache[t] || (colCache[t] = getTableColumns(db, t));
        const ids = new Set<number>();
        for (const g of grouped) {
          if (g.target !== t) continue;
          const idIdx = g.columns.findIndex(oc => resolveColumn(t, oc, cols) === 'officer_id');
          if (idIdx < 0) continue;
          for (const row of g.rows) {
            if (row.length !== g.columns.length) continue;
            const v = transformValue(row[idIdx]);
            if (typeof v === 'number' && Number.isFinite(v)) ids.add(v);
          }
        }
        for (const id of ids) db.run(`DELETE FROM ${t} WHERE officer_id = ?`, [id]);
        counts[t] = 0;
      }
    }

    // officers keeps its dump row order: assign an incrementing import_order as the ELASASY
    // rows are inserted (grouped preserves statement/row order), so every officer listing can
    // sort by it instead of re-deriving a sort the app can't reproduce (kin_c isn't imported).
    // In append mode the table still holds its previous rows, so continue the sequence after the
    // current maximum rather than restarting at 0 (which would collide with the stored order).
    let officerSeq = 0;
    if (mode === 'append') {
      const r = db.exec('SELECT COALESCE(MAX(import_order), -1) + 1 FROM officers');
      if (r.length && r[0].values.length) officerSeq = Number(r[0].values[0][0]) || 0;
    }
    for (const g of grouped) {
      const cols = colCache[g.target] || (colCache[g.target] = getTableColumns(db, g.target));
      const keep: number[] = [];
      const targetCols: string[] = [];
      g.columns.forEach((oc, i) => {
        const resolved = resolveColumn(g.target, oc, cols);
        if (!resolved) (skipped[g.target] ||= new Set()).add(oc);
        else if (!targetCols.includes(resolved)) { keep.push(i); targetCols.push(resolved); }
      });
      // Skip a block with no real column match (only the officer key) so a mislabeled
      // dump can neither wipe nor pollute an unrelated table.
      if (!targetCols.some(c => c !== 'officer_id')) continue;

      // Append a synthetic import_order column for the officers dump only.
      const withOrder = g.target === 'officers' && cols.has('import_order');
      const insertCols = withOrder ? [...targetCols, 'import_order'] : targetCols;

      const key = `${g.target}|${insertCols.join(',')}`;
      let stmt = stmtCache.get(key);
      if (!stmt) {
        const ph = insertCols.map(() => '?').join(', ');
        // Replace mode overwrites a row sharing a primary key (only relevant for duplicates
        // inside the file, since the table was just wiped). Append mode uses a plain INSERT so a
        // clash with a row that already exists raises an error surfaced to the admin instead of
        // silently overwriting data that must be preserved.
        const verb = mode === 'append' ? 'INSERT INTO' : 'INSERT OR REPLACE INTO';
        // sql.js exposes prepare() at runtime; its bundled types omit it here.
        stmt = (db as any).prepare(`${verb} ${g.target} (${insertCols.join(', ')}) VALUES (${ph})`);
        stmtCache.set(key, stmt);
      }

      for (const row of g.rows) {
        if (row.length !== g.columns.length) {
          warnings.push(`تخطي صف بعدد قيم غير مطابق في ${g.source}`);
          continue;
        }
        const vals = keep.map((i, k) => arabizeTextColumn(g.target, targetCols[k], transformValue(row[i])));
        if (withOrder) vals.push(officerSeq++);
        // Name the source table in any SQL failure so the returned message tells the admin
        // exactly where the file broke (e.g. a duplicate key when adding without deleting).
        try {
          stmt.bind(vals as any);
          stmt.step();
          stmt.reset();
        } catch (e: any) {
          throw new Error(`تعذّر تنفيذ عبارة الإدخال في الجدول ${g.source} (${g.target}): ${e?.message || String(e)}`);
        }
        counts[g.target] = (counts[g.target] || 0) + 1;
      }
    }

    for (const s of stmtCache.values()) s.free();
    db.run('COMMIT');
  } catch (e) {
    for (const s of stmtCache.values()) { try { s.free(); } catch { /* ignore */ } }
    db.run('ROLLBACK');
    db.run('PRAGMA foreign_keys = ON');
    throw e;
  }
  db.run('PRAGMA foreign_keys = ON');

  for (const [t, set] of Object.entries(skipped)) {
    if (set.size) warnings.push(`${t}: أعمدة غير معروفة تم تجاهلها (${[...set].join(', ')})`);
  }

  const results = targetsPresent
    .filter(t => resolvableTargets.has(t))
    .map(t => ({ table: t, count: counts[t] || 0 }));
  return { results, warnings };
}
