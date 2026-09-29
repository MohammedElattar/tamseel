import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { broadcast } from '../realtime.js';

// Default to data/edara.db; EDARA_DB_PATH overrides it (used by tests/verification against a
// throwaway DB so they never touch the live file).
const DB_PATH = path.resolve(process.env.EDARA_DB_PATH || path.join('data', 'edara.db'));

let db: Database;

export async function initDB(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  const schemaPath = path.resolve('src', 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.run(schema);
  }

  runMigrations(db);

  saveDB();
  return db;
}

// Additive column migrations for databases created before a column existed.
// CREATE TABLE IF NOT EXISTS does not alter existing tables, so add columns here.
function runMigrations(database: Database): void {
  // Single committee type now: drop the retired edarya/judicial/ta3n tables (existing DBs).
  dropEdaryaTables(database);
  // التمثيل العسكري raw career tables the score engine reads (existing DBs; fresh DBs get them
  // from schema.sql).
  createRawCareerTables(database);
  // مسير الخدمة scoring tables (score_basis + officer_service_score).
  createScoreTables(database);
  // بنود التقييم tables (template + per-committee).
  createEvalItemTables(database);
  // التمثيل العسكري: per-member per-بند interview scores.
  createMemberScoreTables(database);
  const additions = [
    'ALTER TABLE committee_member_assignments ADD COLUMN included INTEGER DEFAULT 1',
    'ALTER TABLE l_lagna_type ADD COLUMN taraky_full_n TEXT',
    'ALTER TABLE l_lagna_type ADD COLUMN nashra_rank INTEGER',
    'ALTER TABLE l_lagna_type ADD COLUMN nashra_type INTEGER',
    'ALTER TABLE l_lagna_type ADD COLUMN nashra_tagdeed INTEGER',
    'ALTER TABLE committee_officers ADD COLUMN hidden INTEGER DEFAULT 0',
    'ALTER TABLE committee_officers ADD COLUMN dispute INTEGER DEFAULT 0',
    'ALTER TABLE committee_officers ADD COLUMN dont_print INTEGER DEFAULT 0',
    'ALTER TABLE committee_officers ADD COLUMN kaed_tawsya INTEGER',
    'ALTER TABLE committee_officers ADD COLUMN out_date TEXT',
    'ALTER TABLE committee_officers ADD COLUMN reg_state TEXT',
    'ALTER TABLE committee_officers ADD COLUMN mosa2la1 TEXT',
    'ALTER TABLE committee_officers ADD COLUMN mosa2la2 TEXT',
    'ALTER TABLE committee_officers ADD COLUMN mosa2la3 TEXT',
    'ALTER TABLE committee_officers ADD COLUMN nafsy TEXT',
    'ALTER TABLE committee_officers ADD COLUMN estifa INTEGER',
    'ALTER TABLE committee_officers ADD COLUMN estifa_auto INTEGER',
    'ALTER TABLE officers ADD COLUMN off_notice TEXT',
    'ALTER TABLE takyeem_scores ADD COLUMN dont_want TEXT',
    'ALTER TABLE derasat_olia ADD COLUMN mawkaf INTEGER DEFAULT 0',
    'ALTER TABLE joblevel_promotion ADD COLUMN promotes_kin_c INTEGER',
    'ALTER TABLE joblevel_promotion ADD COLUMN level_n TEXT',
    'ALTER TABLE joblevel_promotion ADD COLUMN category INTEGER',
    'ALTER TABLE officer_holder_wazayef ADD COLUMN job_c INTEGER',
    'ALTER TABLE officer_kafaa ADD COLUMN asbakeya TEXT',
    'ALTER TABLE officer_holder_paasat ADD COLUMN country TEXT',
    // الوظائف السابقة now mirrors the imported columns verbatim (no joins).
    'ALTER TABLE officer_holder_wazayef ADD COLUMN ran_n_mrtb TEXT',
    'ALTER TABLE officer_holder_wazayef ADD COLUMN wasfia_tuahel_trky TEXT',
    'ALTER TABLE officer_holder_wazayef ADD COLUMN from_date TEXT',
    'ALTER TABLE officer_holder_wazayef ADD COLUMN to_date TEXT',
    'ALTER TABLE officer_holder_wazayef ADD COLUMN year INTEGER',
    'ALTER TABLE officer_holder_wazayef ADD COLUMN month INTEGER',
    // التدرج الوظيفي promotion markers: imported TARAKY_C / TARAKY_C_SUGGESTED plus the
    // pre-computed MARKED_COLOR (dark_green / light_green) that highlights a career-history row.
    'ALTER TABLE officer_holder_wazayef ADD COLUMN taraky_c REAL',
    'ALTER TABLE officer_holder_wazayef ADD COLUMN taraky_c_suggested REAL',
    'ALTER TABLE officer_holder_wazayef ADD COLUMN marked_color TEXT',
    // ELASASY denormalized officer import (text, no code joins). marital_status already
    // exists (INTEGER decl on old DBs) and stores the Arabic text fine, so it is not re-added.
    'ALTER TABLE officers ADD COLUMN full_rank TEXT',
    'ALTER TABLE officers ADD COLUMN akdameya TEXT',
    'ALTER TABLE officers ADD COLUMN nashra_date TEXT',
    'ALTER TABLE officers ADD COLUMN taraky_c REAL',
    'ALTER TABLE officers ADD COLUMN unt_n TEXT',
    'ALTER TABLE officers ADD COLUMN job_n TEXT',
    'ALTER TABLE officers ADD COLUMN speciality TEXT',
    'ALTER TABLE officers ADD COLUMN taraky_tagdeed TEXT',
    'ALTER TABLE officers ADD COLUMN fark_wazn REAL',
    'ALTER TABLE officers ADD COLUMN taraky_estifa TEXT',
    'ALTER TABLE officers ADD COLUMN estifa_job TEXT',
    'ALTER TABLE officers ADD COLUMN entedab TEXT',
    // ملحق علي (ELHAQ_UNIT): attachment unit, imported verbatim; shown on the member card only
    // to the commander seats (EVAL1/EVAL9).
    'ALTER TABLE officers ADD COLUMN elhaq_unit TEXT',
    'ALTER TABLE officers ADD COLUMN wife_status TEXT',
    'ALTER TABLE officers ADD COLUMN mil_qualification TEXT',
    'ALTER TABLE officers ADD COLUMN civil_qualification TEXT',
    'ALTER TABLE officers ADD COLUMN tawsya_ka2ed TEXT',
    'ALTER TABLE officers ADD COLUMN is_deleted INTEGER DEFAULT 0',
    // Row order of the ELASASY dump; every officer listing sorts by it to keep the imported order.
    'ALTER TABLE officers ADD COLUMN import_order INTEGER',
    'ALTER TABLE officer_photos ADD COLUMN couple BLOB',
    // العام التدريبي (TRANING_YEAR) for the التمثيل العسكري candidate filter/display.
    'ALTER TABLE officers ADD COLUMN training_year INTEGER',
    // لشغل وظيفة (ACTIV_NOTE): the imported target post per candidate.
    'ALTER TABLE officers ADD COLUMN activ_note TEXT',
    // التمثيل العسكري: target post (لشغل وظيفة) + interview date per candidate; committee training year.
    'ALTER TABLE committee_officers ADD COLUMN target_job TEXT',
    'ALTER TABLE committee_officers ADD COLUMN interview_date TEXT',
    'ALTER TABLE committees ADD COLUMN training_year INTEGER',
    // Imported per-officer review notes (V_ALL_TAHIL): free text shown as-is on the voting card.
    'ALTER TABLE officers ADD COLUMN se7a TEXT',
    'ALTER TABLE officers ADD COLUMN kafaa_takreer TEXT',
    'ALTER TABLE officers ADD COLUMN mohakma_geza TEXT',
    'ALTER TABLE officers ADD COLUMN kyada TEXT',
    'ALTER TABLE officers ADD COLUMN ragba TEXT',
    // توصية القائد المباشر (RA8BA_TWSIA): imported verbatim, shown as-is on the voting card and
    // dropped entirely when the officer has no value (replaces the tawsya_ka2ed display source).
    'ALTER TABLE officers ADD COLUMN ra8ba_twsia TEXT',
    // تقارير الكفاءة (SECURITYS) now stored verbatim: KAED/MOSDAK ratings, MM-YYYY period,
    // and the التقدير text. from_date/to_date already exist; old rating columns stay vestigial.
    'ALTER TABLE officer_kafaa ADD COLUMN from_date_c TEXT',
    'ALTER TABLE officer_kafaa ADD COLUMN mosdak INTEGER',
    'ALTER TABLE officer_kafaa ADD COLUMN kaed INTEGER',
    'ALTER TABLE officer_kafaa ADD COLUMN grade_com TEXT',
    // البعثات والمأموريات (ba3ast) stored verbatim: activity type/note/code, country, dates.
    'ALTER TABLE officer_holder_paasat ADD COLUMN activ_name TEXT',
    'ALTER TABLE officer_holder_paasat ADD COLUMN activ_note TEXT',
    'ALTER TABLE officer_holder_paasat ADD COLUMN activ_code INTEGER',
    'ALTER TABLE officer_holder_paasat ADD COLUMN date_from TEXT',
    'ALTER TABLE officer_holder_paasat ADD COLUMN date_to TEXT',
    'ALTER TABLE officer_holder_paasat ADD COLUMN country_name TEXT',
    // المحاكمات/الجزاءات merged into a single verbatim text column (Oracle `gaza`).
    'ALTER TABLE officer_punishments_geza ADD COLUMN gaza TEXT',
    // الحالة الصحية stored verbatim as a single text column (Oracle `se7a`).
    'ALTER TABLE officer_holder_health ADD COLUMN se7a TEXT',
    // Read-only guest seats (زائر): a member account that is never assigned to a committee.
    'ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0',
    // Member rank, editable on the الأعضاء page (members aren't officers, so it lives here).
    'ALTER TABLE users ADD COLUMN rank_name TEXT',
    // لغة إنجليزية: admin-entered بند score per officer (computed بند, like مسير الخدمة %).
    'ALTER TABLE officer_service_score ADD COLUMN english REAL',
  ];
  for (const sql of additions) {
    try {
      database.run(sql);
    } catch {
      // Column already exists; ignore.
    }
  }

  // المحاكمات/الجزاءات are one merged table again; drop the short-lived, now-unused
  // officer_mo7akmat (empty on any DB that briefly had it). No-op on a fresh DB.
  try { database.run('DROP TABLE IF EXISTS officer_mo7akmat'); } catch { /* ignore */ }

  dedupeOfficersInNashra(database);
  migrateMemberVotesTa3n(database);
  migrateMemberVotesOpinionRange(database);
  migrateEnglishComputed(database);
  dropRetiredColumns(database);
  backfillCommitteeOfficerSnapshots(database);
  migrateOfficerPhotosKey(database);
}

// officer_photos used to be keyed by military number (person_id); it is now keyed by officer
// id (officers.id) so uploads match a folder-per-officer named by id. Rebuild the table when
// the old person_id column is present, remapping each row to its officer id via the officers
// table. Rows whose officer isn't currently imported are dropped (photos are re-uploadable,
// and this is a one-off convention change). Idempotent: a DB already on the new shape has no
// person_id column, so nothing runs.
function migrateOfficerPhotosKey(database: Database): void {
  try {
    const info = database.exec('PRAGMA table_info(officer_photos)');
    const cols: any[] = info.length ? info[0].values : [];
    const hasPersonId = cols.some((r: any[]) => r[1] === 'person_id');
    if (cols.length && hasPersonId) {
      database.run(`
        CREATE TABLE officer_photos_new (
          officer_id INTEGER PRIMARY KEY,
          personal BLOB,
          family BLOB,
          updated_at TEXT
        );
        INSERT OR IGNORE INTO officer_photos_new (officer_id, personal, family, updated_at)
          SELECT o.id, p.personal, p.family, p.updated_at
          FROM officer_photos p JOIN officers o ON o.person_id = p.person_id;
        DROP TABLE officer_photos;
        ALTER TABLE officer_photos_new RENAME TO officer_photos;
      `);
    }
  } catch {
    // Best-effort; a fresh DB already has the new shape from schema.sql.
  }
}

// Columns whose feature has been retired. Idempotent — DROP COLUMN throws once the column is
// gone (caught), and does nothing on a fresh DB where schema.sql never created it.
function dropRetiredColumns(database: Database): void {
  const drops = [
    // The member-grade / career-weighted scoring: member vote degrees, the committee
    // career-vs-member weights, and the grade-band limits. Every tagdded committee now votes
    // يستمر/يحال/يؤجل like الرئيسية.
    'ALTER TABLE member_votes DROP COLUMN degree',
    'ALTER TABLE member_votes DROP COLUMN final_degree',
    'ALTER TABLE committees DROP COLUMN history_limit',
    'ALTER TABLE committees DROP COLUMN member_limit',
    'ALTER TABLE committees DROP COLUMN good_limit',
    'ALTER TABLE committees DROP COLUMN pass_limit',
  ];
  for (const sql of drops) {
    try {
      database.run(sql);
    } catch {
      // Column already dropped (or never existed on a fresh DB); ignore.
    }
  }
}

// One-off repair: committees loaded during the officers text-import transition captured a
// NULL unit_name snapshot (the column was briefly misnamed unit_n vs unt_n). Backfill any
// NULL name snapshots on committee_officers from the live officers row, so every screen
// (member voting, committee detail, reports) shows them without a disruptive re-load.
function backfillCommitteeOfficerSnapshots(database: Database): void {
  try {
    database.run(`
      UPDATE committee_officers
      SET unit_name    = COALESCE(unit_name,    (SELECT o.unt_n     FROM officers o WHERE o.id = committee_officers.officer_id)),
          rank_name    = COALESCE(rank_name,    (SELECT o.full_rank FROM officers o WHERE o.id = committee_officers.officer_id)),
          job_name     = COALESCE(job_name,     (SELECT o.job_n     FROM officers o WHERE o.id = committee_officers.officer_id)),
          officer_name = COALESCE(officer_name, (SELECT o.per_name  FROM officers o WHERE o.id = committee_officers.officer_id))
      WHERE unit_name IS NULL OR rank_name IS NULL OR job_name IS NULL OR officer_name IS NULL;
    `);
  } catch {
    // Best-effort; fresh DBs have nothing to backfill.
  }
}

// officers_in_nashra had no uniqueness guard, so repeated seeds appended duplicate
// (officer_id, nashra_date) rows. Collapse them and add a unique index so INSERT OR
// IGNORE dedupes going forward. Duplicates made the tagdded load create several
// committee_officers rows sharing one officer_id (session actions then hit them all).
function dedupeOfficersInNashra(database: Database): void {
  try {
    database.run(`
      DELETE FROM officers_in_nashra
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM officers_in_nashra GROUP BY officer_id, nashra_date
      );
    `);
    database.run(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_oin_officer_nashra ON officers_in_nashra(officer_id, nashra_date)'
    );
  } catch {
    // Best-effort; fresh DBs get the index from the first clean run.
  }
}

// member_votes gained a ta3n_type column keyed into its UNIQUE constraint. SQLite
// can't alter a table-level UNIQUE, so rebuild the table when the column is missing.
function migrateMemberVotesTa3n(database: Database): void {
  try {
    const info = database.exec('PRAGMA table_info(member_votes)');
    const cols: any[] = info.length ? info[0].values : [];
    const hasTa3n = cols.some((r: any[]) => r[1] === 'ta3n_type');
    if (cols.length && !hasTa3n) {
      database.run(`
        CREATE TABLE member_votes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          committee_id INTEGER NOT NULL REFERENCES committees(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          officer_id INTEGER NOT NULL,
          ta3n_type INTEGER DEFAULT 0,
          eval_state INTEGER DEFAULT 0 CHECK (eval_state IN (0, 1, 2)),
          user_opinion INTEGER DEFAULT 2 CHECK (user_opinion BETWEEN -1 AND 99),
          voted_at TEXT,
          UNIQUE(committee_id, user_id, officer_id, ta3n_type)
        );
        INSERT INTO member_votes_new
          (id, committee_id, user_id, officer_id, ta3n_type, eval_state, user_opinion, voted_at)
          SELECT id, committee_id, user_id, officer_id, 0, eval_state, user_opinion, voted_at
          FROM member_votes;
        DROP TABLE member_votes;
        ALTER TABLE member_votes_new RENAME TO member_votes;
        CREATE INDEX IF NOT EXISTS idx_member_votes_committee ON member_votes(committee_id);
        CREATE INDEX IF NOT EXISTS idx_member_votes_user ON member_votes(user_id);
      `);
    }
  } catch {
    // Best-effort; a fresh DB already has the new shape from schema.sql.
  }
}

// user_opinion used to be enumerated (-1,0,1,2,3,4), which capped edarya at five decision
// buttons. Options are now rows in ta3n_type_options, so the column takes an open range and the
// admin can add new ones. SQLite can't alter a CHECK, so rebuild when the old enum is still in
// the stored DDL. Idempotent: the rebuilt DDL has no `user_opinion IN (` to match.
function migrateMemberVotesOpinionRange(database: Database): void {
  try {
    const ddl = database.exec(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'member_votes'"
    );
    const sql = (ddl[0]?.values[0]?.[0] as string) ?? '';
    if (!sql.includes('user_opinion IN (')) return;
    database.run(`
      CREATE TABLE member_votes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        committee_id INTEGER NOT NULL REFERENCES committees(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        officer_id INTEGER NOT NULL,
        ta3n_type INTEGER DEFAULT 0,
        eval_state INTEGER DEFAULT 0 CHECK (eval_state IN (0, 1, 2)),
        user_opinion INTEGER DEFAULT 2 CHECK (user_opinion BETWEEN -1 AND 99),
        voted_at TEXT,
        UNIQUE(committee_id, user_id, officer_id, ta3n_type)
      );
      INSERT INTO member_votes_new
        (id, committee_id, user_id, officer_id, ta3n_type, eval_state, user_opinion, voted_at)
        SELECT id, committee_id, user_id, officer_id, COALESCE(ta3n_type, 0), eval_state, user_opinion, voted_at
        FROM member_votes;
      DROP TABLE member_votes;
      ALTER TABLE member_votes_new RENAME TO member_votes;
      CREATE INDEX IF NOT EXISTS idx_member_votes_committee ON member_votes(committee_id);
      CREATE INDEX IF NOT EXISTS idx_member_votes_user ON member_votes(user_id);
    `);
  } catch {
    // Best-effort; a fresh DB already has the open range from schema.sql.
  }
}

// Single committee type: the edarya/judicial/ta3n config + case tables are retired. Drop them
// on existing DBs (children first so no foreign key dangles). No-op on a fresh DB — schema.sql
// no longer creates them.
function dropEdaryaTables(database: Database): void {
  const tables = [
    'committee_officer_ard',
    'committee_officer_case_values',
    'ta3n_type_options',
    'ta3n_type_fields',
    'ta3n_types',
    'eval_judicial_ard_decision',
    'eval_judicial_ard_type',
    'eval_judicial_lagna_cat',
  ];
  const fkOn = (() => {
    try { return (database.exec('PRAGMA foreign_keys')[0]?.values[0]?.[0] as number) === 1; }
    catch { return true; }
  })();
  try {
    if (fkOn) database.run('PRAGMA foreign_keys = OFF');
    for (const t of tables) {
      try { database.run(`DROP TABLE IF EXISTS ${t}`); } catch { /* ignore */ }
    }
  } finally {
    if (fkOn) database.run('PRAGMA foreign_keys = ON');
  }
}

// التمثيل العسكري raw career tables (خدمة التشكيلات / الأوسمة / التأهيل) the score engine reads.
// CREATE IF NOT EXISTS is idempotent, so this safely adds them to an existing DB.
function createRawCareerTables(database: Database): void {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS officer_tashkeelat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL,
      tashkeelat TEXT,
      khadma TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS officer_medals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL,
      wis_n TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS officer_qualification (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer_id INTEGER NOT NULL,
      txt TEXT,
      grade REAL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_officer_tashkeelat_officer ON officer_tashkeelat(officer_id)',
    'CREATE INDEX IF NOT EXISTS idx_officer_medals_officer ON officer_medals(officer_id)',
    'CREATE INDEX IF NOT EXISTS idx_officer_qualification_officer ON officer_qualification(officer_id)',
  ];
  for (const s of stmts) { try { database.run(s); } catch { /* ignore */ } }
}

// بنود التقييم: the global default template + the per-committee copy each committee edits.
function createEvalItemTables(database: Database): void {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS eval_item_template (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial INTEGER, name TEXT NOT NULL, max_degree REAL NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'manual', source TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS committee_eval_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      committee_id INTEGER NOT NULL,
      serial INTEGER, name TEXT NOT NULL, max_degree REAL NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'manual', source TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_committee_eval_items_committee ON committee_eval_items(committee_id)',
  ];
  for (const s of stmts) { try { database.run(s); } catch { /* ignore */ } }
}

// مسير الخدمة scoring: the أسس (max per component) config + the per-officer entered/computed scores.
function createScoreTables(database: Database): void {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS score_basis (
      component TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      max_degree REAL NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS officer_service_score (
      officer_id INTEGER PRIMARY KEY,
      jobs REAL, tahil REAL, kafaa REAL, tashkeelat REAL, awsama REAL, ba3asat REAL, gaza REAL,
      kafaa_avg REAL,
      total REAL,
      pct REAL,
      english REAL,
      updated_at TEXT
    )`,
  ];
  for (const s of stmts) { try { database.run(s); } catch { /* ignore */ } }
}

// التمثيل العسكري: per-member per-بند interview scores (each member scores the manual بنود).
function createMemberScoreTables(database: Database): void {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS member_item_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      committee_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      officer_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      score REAL,
      updated_at TEXT,
      UNIQUE(committee_id, user_id, officer_id, item_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_member_item_scores_officer ON member_item_scores(committee_id, officer_id)',
  ];
  for (const s of stmts) { try { database.run(s); } catch { /* ignore */ } }
}

// لغة إنجليزية is now an admin-entered (computed) بند like مسير الخدمة, not member-entered. Flip the
// default template and every per-committee copy to kind=computed/source=english. Idempotent; no-op
// once migrated and on a fresh DB (the template is seeded straight to computed).
function migrateEnglishComputed(database: Database): void {
  const stmts = [
    "UPDATE eval_item_template SET kind = 'computed', source = 'english' WHERE name = 'لغة إنجليزية' AND (kind <> 'computed' OR source IS NULL OR source <> 'english')",
    "UPDATE committee_eval_items SET kind = 'computed', source = 'english' WHERE name = 'لغة إنجليزية' AND (kind <> 'computed' OR source IS NULL OR source <> 'english')",
  ];
  for (const s of stmts) { try { database.run(s); } catch { /* ignore */ } }
}

export function getDB(): Database {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

export function saveDB(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  // Notify live clients that data changed (no-op until clients connect).
  broadcast({ type: 'db-changed' });
}
