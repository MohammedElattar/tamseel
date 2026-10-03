-- ============================================================
-- IMPORTED TABLES (wiped and reloaded quarterly from .sql file)
-- ============================================================

CREATE TABLE IF NOT EXISTS officers (
  id INTEGER PRIMARY KEY,
  person_id INTEGER,
  per_name TEXT NOT NULL,
  national_id TEXT,
  rank_code INTEGER,
  cadre_code INTEGER,
  kind_code INTEGER,
  unit_code INTEGER,
  job_code INTEGER,
  spec_code INTEGER,
  spec_branch_code INTEGER,
  arm_code INTEGER,
  dofa_no INTEGER,
  in_service TEXT DEFAULT 'Y',
  date_birth TEXT,
  date_rank TEXT,
  date_enter TEXT,
  date_trans TEXT,
  date_khdma TEXT,
  ser_rank TEXT,
  ser_trans TEXT,
  gender TEXT,
  blood TEXT,
  height REAL,
  weight REAL,
  marital_status TEXT,
  boy_no INTEGER,
  girl_no INTEGER,
  home_address TEXT,
  birth_address TEXT,
  home_tel TEXT,
  mobile_tel TEXT,
  job_tel TEXT,
  photo BLOB,
  arkan TEXT,
  akdam_no INTEGER,
  akdam_rep TEXT,
  moh_c INTEGER,
  markz_c INTEGER,
  moh_c_birth INTEGER,
  markz_c_birth INTEGER,
  khd_c INTEGER,
  mok_c INTEGER,
  father_name TEXT,
  mother_name TEXT,
  father_rel TEXT,
  mother_rel TEXT,
  father_add TEXT,
  mother_add TEXT,
  nat_father TEXT,
  nat_mother TEXT,
  job_father TEXT,
  job_mother TEXT,
  g_father_name TEXT,
  g_mother_name TEXT,
  g_father_nat TEXT,
  g_mother_nat TEXT,
  g_father_rel TEXT,
  g_mather_rel TEXT,
  g_father_job TEXT,
  g_mother_job TEXT,
  g_father_add TEXT,
  g_mother_add TEXT,
  wife_rel TEXT,
  w_father_name TEXT,
  w_mother_name TEXT,
  w_father_rel TEXT,
  w_mother_rel TEXT,
  w_father_nat TEXT,
  w_mother_nat TEXT,
  w_father_job TEXT,
  w_mother_job TEXT,
  w_father_add TEXT,
  w_mother_add TEXT,
  wife_add TEXT,
  prim_s TEXT,
  preb_s TEXT,
  sec_s TEXT,
  faculty TEXT,
  faculty_academy INTEGER,
  main_qualify_spec TEXT,
  main_qualify_date TEXT,
  sea_cert_no TEXT,
  sea_cert_date TEXT,
  self_cert_no TEXT,
  self_cert_date TEXT,
  exp_cert_no TEXT,
  exp_cert_date TEXT,
  wehda TEXT,
  card_no TEXT,
  kind_card TEXT,
  card_t TEXT,
  card_t_fam TEXT,
  name_rel TEXT,
  address_rel TEXT,
  rel TEXT,
  job_before TEXT,
  accused TEXT,
  acc_date TEXT,
  acc_case_no TEXT,
  navy_dofa_no INTEGER,
  dofa_type TEXT,
  photo_revised TEXT DEFAULT 'N',
  normalized_per_name TEXT,
  last_tahil INTEGER,
  last_tahil_date TEXT,
  elhaq_unt_c INTEGER,
  elhaq_job_c INTEGER,
  elhaq_begin_date TEXT,
  off_notice TEXT,
  -- ELASASY denormalized import (stored verbatim; no code joins). المرتب/رتبة/وحدة/وظيفة
  -- as text, plus the pre-computed استيفاء / promotion / qualification results.
  full_rank TEXT,
  akdameya TEXT,
  nashra_date TEXT,
  -- العام التدريبي (TRANING_YEAR): drives the التمثيل العسكري candidate filter/display.
  training_year INTEGER,
  -- لشغل وظيفة (ACTIV_NOTE): the post the officer is presented for; imported, shown read-only.
  activ_note TEXT,
  taraky_c REAL,
  unt_n TEXT,
  job_n TEXT,
  speciality TEXT,
  taraky_tagdeed TEXT,
  fark_wazn REAL,
  taraky_estifa TEXT,
  estifa_job TEXT,
  entedab TEXT,
  -- ملحق علي (ELHAQ_UNIT): the unit the officer is attached to. Sensitive — on the member
  -- voting card the value is exposed only to the commander seats (EVAL1/EVAL9). Nullable.
  elhaq_unit TEXT,
  wife_status TEXT,
  mil_qualification TEXT,
  civil_qualification TEXT,
  tawsya_ka2ed TEXT,
  -- توصية القائد المباشر (RA8BA_TWSIA): imported verbatim; shown as-is on the voting card and
  -- dropped entirely when the officer has no value.
  ra8ba_twsia TEXT,
  -- محل الإقامة (MOH_N, the governorate name): imported verbatim, shown on the voting card.
  moh_n TEXT,
  -- Row sequence in the ELASASY dump. The Navy exports officers already sorted (including a
  -- kin_c group the app never imports), so we preserve that file order here and sort every
  -- officer listing by it instead of re-deriving a sort we can't reproduce.
  import_order INTEGER,
  is_deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ranks (
  ran_c INTEGER PRIMARY KEY,
  ran_n TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cadres (
  kad_c INTEGER PRIMARY KEY,
  kad_n TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kindoff (
  kin_c INTEGER PRIMARY KEY,
  kin_n TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  unt_c INTEGER PRIMARY KEY,
  unt_n TEXT NOT NULL,
  munt_c INTEGER
);

CREATE TABLE IF NOT EXISTS jobs (
  job_c INTEGER PRIMARY KEY,
  job_n TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS specializations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  speb_c INTEGER,
  speb_n TEXT,
  spe_c INTEGER,
  spe_n TEXT
);

CREATE TABLE IF NOT EXISTS officer_kafaa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  from_date_c TEXT,   -- FROM_DATE_C (فترة التقرير: MM-YYYY)
  to_date TEXT,       -- TO_DATE (نهاية الفترة: MM-YYYY)
  mosdak INTEGER,     -- MOSDAK (تقييم القائد المصدق)
  kaed INTEGER,       -- KAED (تقييم القائد المباشر)
  from_date TEXT,     -- FROM_DATE (ISO؛ يُستخدم للترتيب فقط)
  grade_com TEXT      -- GRADE_COM (التقدير)
);

-- المحاكمات/الجزاءات merged into one verbatim table (Oracle `gaza`): one full-text
-- statement per entry (the date is inline in the text).
CREATE TABLE IF NOT EXISTS officer_punishments_geza (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  gaza TEXT
);

CREATE TABLE IF NOT EXISTS officer_holder_wazayef (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  ran_n TEXT,               -- رتبة الضابط وقت شغل الوظيفة
  unt_n TEXT,               -- الوحدة
  job_n TEXT,               -- الوظيفة
  ran_n_mrtb TEXT,          -- المرتب (RAN_N_1 / RAN_N_MRTB)
  wasfia_tuahel_trky TEXT,  -- الوظيفة تؤهل للترقي
  from_date TEXT,           -- من
  to_date TEXT,             -- إلى (TO_DATE_)
  year INTEGER,             -- سنة
  month INTEGER,            -- شهر
  taraky_c REAL,            -- كود الترقي (TARAKY_C)
  taraky_c_suggested REAL,  -- كود الترقي المقترح (TARAKY_C_SUGGESTED)
  marked_color TEXT         -- dark_green / light_green / null → row highlight
);

CREATE TABLE IF NOT EXISTS officer_holder_kafaa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  from_date TEXT,
  to_date TEXT,
  rating TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS officer_holder_paasat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  activ_name TEXT,     -- ACTIV_NAME (النشاط: بعثة/مأمورية)
  activ_note TEXT,     -- ACTIV_NOTE (البيان / الغرض)
  activ_code INTEGER,  -- ACTIV_CODE (1=بعثة, 3=مأمورية)
  date_from TEXT,      -- DATE_FROM (ISO)
  date_to TEXT,        -- DATE_TO (ISO)
  country_name TEXT    -- COUNTRY_NAME (الدولة)
);

-- الحالة الصحية stored verbatim (Oracle `se7a`): one full-text statement per entry
-- (the date is inline in the text).
CREATE TABLE IF NOT EXISTS officer_holder_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  se7a TEXT
);

-- الدراسات العلمية (Oracle OFF.TAHIL_3LMY): denormalized academic-studies dump, one row per
-- study. TYPE (الدرجة) and MAWKAF (الموقف) already arrive as Arabic text; SUBJECT is the study
-- title (موضوع الدراسة). Keyed by the officer id (ID -> officer_id), one-to-many.
CREATE TABLE IF NOT EXISTS officer_tahil_3lmy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  subject TEXT,   -- SUBJECT (موضوع الدراسة)
  type TEXT,      -- TYPE (الدرجة: ماجيستير/دكتوراة/دبلوم…)
  mawkaf TEXT     -- MAWKAF (الموقف: حاصل/مستمر/مرشح/إلغاء)
);

-- التأهيل العسكري (Oracle OFF.TAHIL_3ASKARY): denormalized military-course dump, one row per
-- course. JOB_N is the course name (e.g. دورة حرب عليا). Keyed by the officer id, one-to-many.
CREATE TABLE IF NOT EXISTS officer_tahil_3askary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  job_n TEXT      -- JOB_N (اسم الدورة)
);

CREATE INDEX IF NOT EXISTS idx_officer_tahil_3lmy_officer ON officer_tahil_3lmy(officer_id);
CREATE INDEX IF NOT EXISTS idx_officer_tahil_3askary_officer ON officer_tahil_3askary(officer_id);

-- ============================================================
-- Raw career tables for the التمثيل العسكري service-record (مسير الخدمة) score engine.
-- Imported (wiped & reloaded) like the other officer dumps; keyed by officers.id.
-- ============================================================

-- خدمة التشكيلات (Oracle ALL_KHADMA_PERIODS): formation-service duration + total-service
-- duration, stored verbatim as month/year text; the engine parses them into a ratio.
CREATE TABLE IF NOT EXISTS officer_tashkeelat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  tashkeelat TEXT,   -- PERIOD_KHADMAT_TASHKEELAT (مدة خدمة التشكيلات)
  khadma TEXT        -- PERIOD_KHADMA (مدة الخدمة الكلية)
);

-- الأوسمة و الأنواط (Oracle WISAM/WISAMC): one row per decoration, name stored verbatim.
CREATE TABLE IF NOT EXISTS officer_medals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  wis_n TEXT         -- WIS_N (اسم الوسام/النوط)
);

-- التأهيل (Oracle OFFICER_TAHIL): qualification text + a numeric grade chosen by rank
-- (GRADE_AGEED for عقيد فأعلى، وإلا GRADE_AMEED). Feeds the التأهيل scoring component.
CREATE TABLE IF NOT EXISTS officer_qualification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  txt TEXT,          -- TXT (وصف التأهيل)
  grade REAL         -- GRADE (الدرجة)
);

CREATE INDEX IF NOT EXISTS idx_officer_tashkeelat_officer ON officer_tashkeelat(officer_id);
CREATE INDEX IF NOT EXISTS idx_officer_medals_officer ON officer_medals(officer_id);
CREATE INDEX IF NOT EXISTS idx_officer_qualification_officer ON officer_qualification(officer_id);

-- ============================================================
-- مسير الخدمة (service-record) scoring — التمثيل العسكري
-- score_basis: max degree per component (أسس التقييم); sum = the total (~1050). Seeded, editable.
-- officer_service_score: the admin-entered degree per component + computed kafaa average + total/pct.
-- No derivation engine — the evaluator types each component's degree; only averages/percentage compute.
-- ============================================================
CREATE TABLE IF NOT EXISTS score_basis (
  component TEXT PRIMARY KEY,   -- jobs, tahil, kafaa, tashkeelat, awsama, ba3asat, gaza
  label TEXT NOT NULL,
  max_degree REAL NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS officer_service_score (
  officer_id INTEGER PRIMARY KEY,
  jobs REAL, tahil REAL, kafaa REAL, tashkeelat REAL, awsama REAL, ba3asat REAL, gaza REAL,
  kafaa_avg REAL,   -- computed: ROUND(AVG(officer_kafaa.kaed))
  total REAL,       -- computed: sum of the 7 entered degrees
  pct REAL,         -- computed: total / SUM(max_degree) * 100
  english REAL,     -- admin-entered لغة إنجليزية بند score (0..100); shown to members read-only
  updated_at TEXT
);

-- بنود التقييم (evaluation items): a global default template + a per-committee copy (each committee
-- edits its own). kind='computed' (value from source, e.g. مسير الخدمة % → source='service_pct')
-- or 'manual' (the member enters the degree while voting).
CREATE TABLE IF NOT EXISTS eval_item_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial INTEGER,
  name TEXT NOT NULL,
  max_degree REAL NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'manual',
  source TEXT
);
CREATE TABLE IF NOT EXISTS committee_eval_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL,
  serial INTEGER,
  name TEXT NOT NULL,
  max_degree REAL NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'manual',
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_committee_eval_items_committee ON committee_eval_items(committee_id);

CREATE TABLE IF NOT EXISTS takyeem_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  kafaa REAL DEFAULT 0,
  jobs REAL DEFAULT 0,
  tashkeelat REAL DEFAULT 0,
  tahil REAL DEFAULT 0,
  passat REAL DEFAULT 0,
  awsama REAL DEFAULT 0,
  gazat REAL DEFAULT 0,
  total REAL DEFAULT 0,
  off_order INTEGER,
  nashra_date TEXT,
  english INTEGER DEFAULT 0,
  dont_want TEXT
);

CREATE TABLE IF NOT EXISTS officers_in_nashra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  nashra_date TEXT,
  nashra_rank INTEGER,
  nashra_type INTEGER,
  nashra_tagdeed INTEGER
);

-- Committee panel roster (legacy Oracle MEMBERS): the senior commanders loaded as voting
-- members by "تحميل الأعضاء". Imported (wiped and reloaded) like the officer dumps, then
-- matched to the fixed EVAL panel seats by job title (JOB_N). member_id is the Oracle ID —
-- informational only and NOT a key: the dump repeats an id across rows (e.g. القائد and
-- مدير شئون الضباط share one id), so rows are keyed by the implicit rowid instead.
CREATE TABLE IF NOT EXISTS members (
  member_id INTEGER,   -- MEMBERS.ID (may repeat; not a key)
  full_rank TEXT,      -- FULL_RANK (الرتبة)
  per_name TEXT,       -- PER_NAME (الاسم)
  job_n TEXT           -- JOB_N (المسمى الوظيفي — يُطابَق بمقعد اللجنة)
);

-- ============================================================
-- Reference/qualification tables for the automatic استيفاء engine
-- (subset of the legacy OFF.* columns actually read by the logic)
-- ============================================================

CREATE TABLE IF NOT EXISTS mrtb (
  job_c INTEGER PRIMARY KEY,
  ran_c INTEGER,
  jobs_takhasoseya INTEGER,
  taraky_c REAL,
  taraky_c_suggested REAL,
  level_c_daleel INTEGER,
  level_c_suggested INTEGER
);

CREATE TABLE IF NOT EXISTS tahil (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  tahc_c INTEGER
);

CREATE TABLE IF NOT EXISTS tahilc (
  tahc_c INTEGER PRIMARY KEY,
  tahc_n TEXT
);

CREATE TABLE IF NOT EXISTS derasat_olia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  type INTEGER,
  mawkaf INTEGER DEFAULT 0
);

-- Medical-board recommendations (legacy OFF.TWSIA) + result lookup (OFF.TWSIA_RESULT),
-- read by the LYAKA (medical fitness) voting-screen indicator.
CREATE TABLE IF NOT EXISTS twsia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  result_c INTEGER,
  desease_date TEXT,
  tws_date_app TEXT
);

CREATE TABLE IF NOT EXISTS twsia_result (
  result_c INTEGER PRIMARY KEY,
  result_n TEXT
);

-- Per-officer document/data completeness (legacy EVAL_OFFICERS_REQUIREMENTS tracker).
-- personal photo + kafaa reports are computed from real data; the rest are tracked here.
CREATE TABLE IF NOT EXISTS officer_requirements (
  officer_id INTEGER PRIMARY KEY,
  family_photo INTEGER DEFAULT 0,
  sheet_121 INTEGER DEFAULT 0,
  awsama INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS nah_rankd_tmp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  job_c INTEGER,
  rank_c INTEGER,
  date1 TEXT,
  date2 TEXT
);

CREATE TABLE IF NOT EXISTS joblevel_promotion (
  level_c INTEGER PRIMARY KEY,
  promotes_to INTEGER,
  promotes_kin_c INTEGER,
  level_n TEXT,
  category INTEGER
);

CREATE TABLE IF NOT EXISTS officers_in_nashra_notes (
  officer_id INTEGER PRIMARY KEY,
  mostawfy INTEGER,
  mostawfy_forced INTEGER,
  most_ran_c REAL,
  cat INTEGER
);

CREATE TABLE IF NOT EXISTS grades (
  grade_id INTEGER PRIMARY KEY,
  grade_name TEXT NOT NULL,
  from_range REAL,
  to_range REAL
);

CREATE TABLE IF NOT EXISTS eval_lagna_cat (
  cat_c INTEGER PRIMARY KEY,
  cat_n TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS l_lagna_type (
  taraky_c REAL PRIMARY KEY,
  taraky_n TEXT NOT NULL,
  taraky_full_n TEXT,
  nashra_rank INTEGER,
  nashra_type INTEGER,
  nashra_tagdeed INTEGER
);

-- ============================================================
-- PERSISTENT TABLES (our system manages)
-- ============================================================

-- Officer portraits (legacy PICT) + family photos (legacy FAMILY_PICT). Keyed by the
-- officer id (officers.id) — the upload folder-per-officer is named by id. officers.id is
-- stable across the quarterly officers wipe/reload (the imported child tables key off it too),
-- so the images survive the reload and re-match once the officer is imported again. Served
-- via /api/officers/:id/photo and /api/officers/:id/family-photo (matched on officer_id).
CREATE TABLE IF NOT EXISTS officer_photos (
  officer_id INTEGER PRIMARY KEY,
  personal BLOB,
  family BLOB,
  updated_at TEXT,
  couple BLOB
);

-- Officer's children (الأبناء والبنات): system-managed detail entered by the admin, kept
-- separate from the imported عدد الأبناء/عدد البنات counts. Keyed by the stable officers.id
-- (same reasoning as officer_photos above) so the rows survive the quarterly officers wipe.
CREATE TABLE IF NOT EXISTS officer_children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  officer_id INTEGER NOT NULL,
  name TEXT,
  gender TEXT,
  date_birth TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_officer_children_officer ON officer_children(officer_id);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  officer_id INTEGER,
  display_name TEXT NOT NULL,
  job_title TEXT,
  job_code INTEGER,
  -- Rank shown for a member on the الأعضاء page. Not on the officers table (members aren't
  -- officers), so it's stored here; falls back to the linked officer / assignment snapshot.
  rank_name TEXT,
  is_active INTEGER DEFAULT 1,
  -- A guest seat: signs in like a member but holds no committee_member_assignments row,
  -- so it can watch the live session without ever counting toward a vote or a quorum.
  is_guest INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS committees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_type TEXT NOT NULL CHECK (committee_type IN ('edarya', 'tagdded')),
  lagna_date TEXT,
  lagna_cat_c INTEGER,
  rank_code INTEGER,
  tamhidy INTEGER DEFAULT 0 CHECK (tamhidy IN (0, 1, 2)),
  prev_tamhidy_committee_id INTEGER REFERENCES committees(id),
  nashra_date TEXT,
  hide_decision INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS committee_officers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL REFERENCES committees(id),
  officer_id INTEGER NOT NULL,
  serial INTEGER,
  rank_code INTEGER,
  rank_name TEXT,
  officer_name TEXT,
  unit_name TEXT,
  job_name TEXT,
  akdam_no INTEGER,
  akdam_rep TEXT,
  l_lagna_type_c REAL,
  eval_type INTEGER,
  final_eval TEXT,
  attendance INTEGER DEFAULT 1,
  late INTEGER DEFAULT 0,
  a_h INTEGER DEFAULT 0,
  repeat_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 0,
  done INTEGER DEFAULT 0,
  del_fill INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  dispute INTEGER DEFAULT 0,
  dont_print INTEGER DEFAULT 0,
  kaed_tawsya INTEGER,
  -- edarya-specific fields
  ta3n_type INTEGER,
  charges TEXT,
  judgement TEXT,
  judgement_confirmation TEXT,
  crime_type INTEGER,
  settlement_text TEXT,
  resignation_text TEXT,
  decision_proposed INTEGER,
  apology INTEGER DEFAULT 0,
  apology_reason TEXT,
  eltemas_e3ada TEXT,
  notes INTEGER,
  notes_text TEXT,
  notes_retirement_date TEXT,
  notes_retirement_reason TEXT,
  -- edarya registration
  out_date TEXT,
  reg_state TEXT,
  -- edarya accountability / psychological
  mosa2la1 TEXT,
  mosa2la2 TEXT,
  mosa2la3 TEXT,
  nafsy TEXT,
  -- fitness
  fitness_flag INTEGER DEFAULT 0,
  -- manual استيفاء (fulfillment): 1 = مستوف, 0 = غير مستوف, NULL = غير محدد
  estifa INTEGER,
  estifa_auto INTEGER,
  -- ترتيب اللجنة: the officer's category (officer_categories.id); NULL = none.
  category_id INTEGER,
  UNIQUE(committee_id, officer_id, ta3n_type)
);

-- ترتيب اللجنة: the global list of officer categories (e.g. ملحق عسكري), managed on its own admin
-- page. A value stays deletable only while no unfinished committee uses it (enforced in code).
-- position is the order every committee's session presents the categories in.
CREATE TABLE IF NOT EXISTS officer_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Categories whose intro screen the commander has already dismissed (متابعة) in a committee's
-- session. No foreign keys, so deleting a committee or category never trips on these rows; both
-- deletes clean them up explicitly.
CREATE TABLE IF NOT EXISTS committee_category_intros (
  committee_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  PRIMARY KEY (committee_id, category_id)
);

CREATE TABLE IF NOT EXISTS committee_member_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL REFERENCES committees(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  serial INTEGER,
  attended INTEGER DEFAULT 1,
  included INTEGER DEFAULT 1,
  job_code_snapshot INTEGER,
  name_snapshot TEXT,
  rank_snapshot TEXT,
  UNIQUE(committee_id, user_id)
);

CREATE TABLE IF NOT EXISTS member_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL REFERENCES committees(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  officer_id INTEGER NOT NULL,
  ta3n_type INTEGER DEFAULT 0,
  eval_state INTEGER DEFAULT 0 CHECK (eval_state IN (0, 1, 2)),
  -- Opinion values come from ta3n_type_options, so the range is open rather than enumerated.
  -- 2 stays reserved as the "seeded but not voted yet" sentinel; admin-added options start at 5.
  user_opinion INTEGER DEFAULT 2 CHECK (user_opinion BETWEEN -1 AND 99),
  voted_at TEXT,
  UNIQUE(committee_id, user_id, officer_id, ta3n_type)
);

-- التمثيل العسكري: per-member per-بند interview scores. مسير الخدمة (kind=computed) is NOT stored
-- here — it comes from officer_service_score; only the manual بنود each member enters live here.
-- The commander's تصدق/لا يتصدق decision stays in member_votes.user_opinion.
CREATE TABLE IF NOT EXISTS member_item_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL REFERENCES committees(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  officer_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  score REAL,
  updated_at TEXT,
  UNIQUE(committee_id, user_id, officer_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_member_item_scores_officer ON member_item_scores(committee_id, officer_id);

CREATE TABLE IF NOT EXISTS committee_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  committee_id INTEGER NOT NULL REFERENCES committees(id),
  backup_date TEXT DEFAULT (datetime('now')),
  data_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_date TEXT DEFAULT (datetime('now')),
  file_name TEXT,
  tables_imported TEXT,
  record_counts_json TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'error')),
  error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_officers_rank ON officers(rank_code);
CREATE INDEX IF NOT EXISTS idx_officers_unit ON officers(unit_code);
CREATE INDEX IF NOT EXISTS idx_officers_job ON officers(job_code);
CREATE INDEX IF NOT EXISTS idx_officers_in_service ON officers(in_service);
CREATE INDEX IF NOT EXISTS idx_officers_name ON officers(per_name);
CREATE INDEX IF NOT EXISTS idx_officers_person_id ON officers(person_id);
CREATE INDEX IF NOT EXISTS idx_committee_officers_committee ON committee_officers(committee_id);
CREATE INDEX IF NOT EXISTS idx_committee_officers_officer ON committee_officers(officer_id);
CREATE INDEX IF NOT EXISTS idx_member_votes_committee ON member_votes(committee_id);
CREATE INDEX IF NOT EXISTS idx_member_votes_user ON member_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_member_votes_officer ON member_votes(officer_id);
CREATE INDEX IF NOT EXISTS idx_officer_kafaa_officer ON officer_kafaa(officer_id);
CREATE INDEX IF NOT EXISTS idx_takyeem_scores_officer ON takyeem_scores(officer_id);
CREATE INDEX IF NOT EXISTS idx_officers_in_nashra_officer ON officers_in_nashra(officer_id);
