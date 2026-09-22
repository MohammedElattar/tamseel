import bcrypt from 'bcryptjs';
import { getDB, saveDB } from './connection.js';
import { COMMITTEE_PANEL } from '../config/committeePanel.js';
import { LAGNA_TYPE_MAP, getTarakyC } from '../config/promotion.js';

export async function seedAdmin(): Promise<void> {
  const db = getDB();
  const existing = db.exec("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
  const count = existing[0]?.values[0]?.[0] as number;

  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run(
      `INSERT INTO users (username, password_hash, role, display_name, job_title)
       VALUES (?, ?, 'admin', ?, ?)`,
      ['admin', hash, 'مدير النظام', 'مدير النظام']
    );
    saveDB();
    console.log('Default admin created: admin / admin123');
  }
}

// The زائر seat: signs in from the login screen like a member but is never assigned to a
// committee, so every vote/quorum/report query (all of which resolve the seat through
// committee_member_assignments) ignores it. It holds no job title — a guest has no role.
export const GUEST_USERNAME = 'GUEST';
export const GUEST_DISPLAY_NAME = 'زائر';
// The seat is entered passwordless from the login screen; password_hash is NOT NULL, so
// this only fills the column.
const DEFAULT_GUEST_PASSWORD = 'guest123';

export async function seedGuest(): Promise<void> {
  const db = getDB();
  const existing = db.exec('SELECT id FROM users WHERE username = ?', [GUEST_USERNAME]);

  if (existing.length && existing[0].values.length) {
    db.run(
      "UPDATE users SET display_name = ?, job_title = NULL, is_guest = 1, role = 'member' WHERE username = ?",
      [GUEST_DISPLAY_NAME, GUEST_USERNAME]
    );
  } else {
    db.run(
      `INSERT INTO users (username, password_hash, role, display_name, job_title, is_guest)
       VALUES (?, ?, 'member', ?, NULL, 1)`,
      [GUEST_USERNAME, bcrypt.hashSync(DEFAULT_GUEST_PASSWORD, 10), GUEST_DISPLAY_NAME]
    );
    console.log(`Guest seat created: ${GUEST_USERNAME}`);
  }
  saveDB();
}

// Materialize the fixed commander panel as real member accounts so the الأعضاء page can
// manage them (edit / remove) even before any committee is created. Runs only on a fresh DB
// (no non-guest members yet); afterwards the admin's add/edit/remove survive restarts.
// Loading a committee's panel ("تحميل الأعضاء") still upserts these same accounts by slot.
export async function seedCommitteePanelMembers(): Promise<void> {
  const db = getDB();
  const existing = db.exec(
    "SELECT COUNT(*) FROM users WHERE role = 'member' AND COALESCE(is_guest, 0) = 0"
  )[0]?.values[0]?.[0] as number;
  if (existing > 0) return;

  const hash = bcrypt.hashSync('member123', 10);
  let created = 0;
  COMMITTEE_PANEL.forEach((slot, i) => {
    const dup = db.exec('SELECT 1 FROM users WHERE username = ?', [slot.slot]);
    if (dup.length && dup[0].values.length) return;

    // Name and rank come from the fixed panel config (the real seat holders); fall back to the
    // position / a default rank if a config entry omits them.
    const name = slot.name || slot.position;
    const rank = slot.rank || (i < 4 ? 'لواء' : 'عميد');
    db.run(
      `INSERT INTO users (username, password_hash, role, display_name, job_title, job_code, rank_name)
       VALUES (?, ?, 'member', ?, ?, ?, ?)`,
      [slot.slot, hash, name, slot.position, slot.jobCode, rank]
    );
    created++;
  });
  if (created > 0) {
    saveDB();
    console.log(`Seeded ${created} committee panel member(s)`);
  }
}

// One-time cleanup of the old seeded test officers (ids 900001–900999) so the admin can import
// real officers into a clean table. Members (users) are always kept — only the now-dangling
// officer_id link is cleared. Heavily guarded so it can never delete real data: it runs only
// when the officers table holds nothing but seed rows AND no successful import has happened.
export async function removeSeededTestData(): Promise<void> {
  const db = getDB();

  try {
    const imported = db.exec("SELECT 1 FROM import_logs WHERE status = 'success' LIMIT 1");
    if (imported.length && imported[0].values.length) return; // a real import happened -> leave as-is
  } catch { /* import_logs may not exist on a very old DB */ }

  const total = (db.exec('SELECT COUNT(*) FROM officers')[0]?.values[0]?.[0] as number) ?? 0;
  if (total === 0) return;
  const seeded = (db.exec('SELECT COUNT(*) FROM officers WHERE id BETWEEN 900001 AND 900999')[0]?.values[0]?.[0] as number) ?? 0;
  if (total !== seeded) return; // real officers are present -> don't touch anything

  // Only seed officers exist, so clearing these officer-scoped tables removes seed data only.
  const officerTables = [
    'officers', 'officers_in_nashra', 'takyeem_scores',
    'officer_holder_wazayef', 'officer_kafaa', 'officer_holder_paasat',
    'officer_punishments_geza', 'officer_holder_health', 'officer_requirements',
    'officer_tahil_3lmy', 'officer_tahil_3askary',
    'officer_tashkeelat', 'officer_medals', 'officer_qualification',
    'officer_photos', 'tahil', 'twsia', 'derasat_olia', 'nah_rankd_tmp',
  ];
  for (const t of officerTables) {
    try { db.run(`DELETE FROM ${t}`); } catch { /* table may not exist on older DBs */ }
  }
  // Keep the member accounts; just drop the dangling link to the removed officers.
  db.run('UPDATE users SET officer_id = NULL WHERE officer_id BETWEEN 900001 AND 900999');
  saveDB();
  console.log(`Removed ${seeded} seeded test officer(s); members kept`);
}

export async function seedLookups(): Promise<void> {
  const db = getDB();

  const rankCount = db.exec('SELECT COUNT(*) FROM ranks');
  if ((rankCount[0]?.values[0]?.[0] as number) === 0) {
    const ranks = [
      [1, 'ملازم'], [2, 'ملازم أول'], [3, 'نقيب'],
      [4, 'رائد'], [5, 'مقدم'], [6, 'عقيد'],
      [7, 'عميد'], [8, 'لواء'],
    ];
    for (const [code, name] of ranks) {
      db.run('INSERT INTO ranks (ran_c, ran_n) VALUES (?, ?)', [code, name]);
    }
    console.log('Seeded ranks');
  }

  const catCount = db.exec('SELECT COUNT(*) FROM eval_lagna_cat');
  if ((catCount[0]?.values[0]?.[0] as number) === 0) {
    const categories = [
      [1, 'تجديد وترقي'],
    ];
    for (const [code, name] of categories) {
      db.run('INSERT INTO eval_lagna_cat (cat_c, cat_n) VALUES (?, ?)', [code, name]);
    }
    console.log('Seeded eval_lagna_cat');
  }

  // Tagdded (تجديد وترقي) committees use a single نوع اللجنة option; reconcile any
  // legacy multi-category seed rows down to the one option.
  db.run("INSERT OR IGNORE INTO eval_lagna_cat (cat_c, cat_n) VALUES (1, 'تجديد وترقي')");
  db.run("UPDATE eval_lagna_cat SET cat_n = 'تجديد وترقي' WHERE cat_c = 1");
  db.run('DELETE FROM eval_lagna_cat WHERE cat_c <> 1');

  const lagnaTypeCount = db.exec('SELECT COUNT(*) FROM l_lagna_type');
  if ((lagnaTypeCount[0]?.values[0]?.[0] as number) === 0) {
    for (const t of LAGNA_TYPE_MAP) {
      db.run(
        `INSERT INTO l_lagna_type (taraky_c, taraky_n, taraky_full_n, nashra_rank, nashra_type, nashra_tagdeed)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [t.tarakyC, t.tarakyN, t.tarakyFullN, t.nashraRank, t.nashraType, t.nashraTagdeed]
      );
    }
    console.log('Seeded l_lagna_type');
  }

  seedScoreBasis();
  seedEvalItemTemplate();
  saveDB();
}

// بنود التقييم: the default template each committee copies from (via «تحميل البنود»). Seeded once on
// an empty table; edits to the template (and per-committee copies) survive restarts. «مسير الخدمة»
// and «لغة إنجليزية» are computed items entered by the admin per officer (source=service_pct / english,
// shown to members read-only); the rest are entered by the member while voting.
function seedEvalItemTemplate(): void {
  const db = getDB();
  const count = db.exec('SELECT COUNT(*) FROM eval_item_template')[0]?.values[0]?.[0] as number;
  if (count > 0) return;
  const rows: [number, string, number, string, string | null][] = [
    [1, 'مسير الخدمة', 100, 'computed', 'service_pct'],
    [2, 'لغة إنجليزية', 100, 'computed', 'english'],
    [3, 'المظهر العام', 20, 'manual', null],
    [4, 'الناسق', 20, 'manual', null],
    [5, 'الثقة بالنفس', 20, 'manual', null],
    [6, 'القدرة على التعبير', 20, 'manual', null],
    [7, 'معلومات عامة', 40, 'manual', null],
    [8, 'إدارة الحوار', 20, 'manual', null],
    [9, 'اللغة', 40, 'manual', null],
  ];
  for (const [s, n, m, k, src] of rows) {
    db.run(
      'INSERT INTO eval_item_template (serial, name, max_degree, kind, source) VALUES (?, ?, ?, ?, ?)',
      [s, n, m, k, src]
    );
  }
  console.log('Seeded eval_item_template (بنود التقييم default)');
}

// مسير الخدمة: default max degree per component (أسس التقييم), summing to 1050. Seeded once on an
// empty table; the admin edits these from the قاعدة التقييم screen and the edits survive restarts.
function seedScoreBasis(): void {
  const db = getDB();
  const count = db.exec('SELECT COUNT(*) FROM score_basis')[0]?.values[0]?.[0] as number;
  if (count > 0) return;
  const rows: [string, string, number, number][] = [
    ['jobs', 'الوظائف', 200, 1],
    ['tahil', 'التأهيل', 180, 2],
    ['kafaa', 'تقارير الكفاءة', 170, 3],
    ['tashkeelat', 'خدمة التشكيلات', 150, 4],
    ['awsama', 'الأوسمة والأنواط', 140, 5],
    ['ba3asat', 'البعثات', 130, 6],
    ['gaza', 'المحاكمات والجزاءات', 80, 7],
  ];
  for (const [c, l, m, o] of rows) {
    db.run(
      'INSERT OR IGNORE INTO score_basis (component, label, max_degree, sort_order) VALUES (?, ?, ?, ?)',
      [c, l, m, o]
    );
  }
  console.log('Seeded score_basis (مسير الخدمة component maxes)');
}

// Panel member names, index-aligned with COMMITTEE_PANEL (officer id = 900001 + index).
const PANEL_OFFICER_NAMES = [
  'أحمد خالد حسن سعيد',
  'محمود عصام عبد الحميد شاهين',
  'طارق سمير محمد الجندي',
  'هشام فؤاد إبراهيم الشناوي',
  'وائل عادل محمود عامر',
  'أشرف نبيل عبد العزيز حجازي',
  'ياسر مدحت السيد الديب',
  'عمرو صلاح أحمد بدر',
  'شريف رأفت عبد الفتاح زكي',
  'تامر لطفي مصطفى النجار',
];

// Seeded officers keep fixed ids, so a name edit here must also reach the rows that
// snapshot the name when a committee was loaded, otherwise the old name lingers on
// screen for committees that already exist.
function renameSeededOfficer(id: number, name: string): void {
  const db = getDB();
  db.run('UPDATE officers SET per_name = ? WHERE id = ? AND per_name <> ?', [name, id, name]);
  db.run('UPDATE committee_officers SET officer_name = ? WHERE officer_id = ? AND officer_name <> ?',
    [name, id, name]);
  db.run("UPDATE users SET display_name = ? WHERE officer_id = ? AND role = 'member' AND display_name <> ?",
    [name, id, name]);
  db.run(
    `UPDATE committee_member_assignments SET name_snapshot = ?
       WHERE name_snapshot <> ? AND user_id IN (SELECT id FROM users WHERE officer_id = ?)`,
    [name, name, id]
  );
}

// Panel positions are copied out of COMMITTEE_PANEL when the job rows are seeded and when
// members are loaded, so editing a position there must also reach those copies, otherwise
// the old title lingers for accounts and committees that already exist.
function renamePanelPosition(slot: string, jobCode: number, position: string): void {
  const db = getDB();
  db.run('UPDATE jobs SET job_n = ? WHERE job_c = ? AND job_n <> ?', [position, jobCode, position]);

  // A seat with no officer behind it falls back to the position as its member name.
  const placeholder = db.exec(
    'SELECT display_name FROM users WHERE username = ? AND officer_id IS NULL',
    [slot]
  )[0]?.values[0]?.[0] as string | undefined;
  if (placeholder && placeholder !== position) {
    db.run('UPDATE users SET display_name = ? WHERE username = ?', [position, slot]);
    db.run(
      'UPDATE committee_member_assignments SET name_snapshot = ? WHERE name_snapshot = ? AND job_code_snapshot = ?',
      [position, placeholder, jobCode]
    );
  }

  db.run("UPDATE users SET job_title = ? WHERE username = ? AND job_title <> ?", [position, slot, position]);
}

// LEGACY / DISABLED: no longer called at startup. Officers now come from the real import,
// and committee members are seeded independently by seedCommitteePanelMembers(). Kept only
// for manual/local use. Seeds the panel job positions and one officer per panel job code.
export async function seedTestPanelOfficers(): Promise<void> {
  const db = getDB();

  const jobCount = db.exec('SELECT COUNT(*) FROM jobs');
  if ((jobCount[0]?.values[0]?.[0] as number) === 0) {
    for (const m of COMMITTEE_PANEL) {
      db.run('INSERT INTO jobs (job_c, job_n) VALUES (?, ?)', [m.jobCode, m.position]);
    }
    console.log('Seeded test jobs (committee panel)');
  }

  const officerCount = db.exec('SELECT COUNT(*) FROM officers');
  if ((officerCount[0]?.values[0]?.[0] as number) === 0) {
    // Senior commanders: top slots لواء (8), the rest عميد (7).
    COMMITTEE_PANEL.forEach((m, i) => {
      const officerId = 900001 + i;
      const rankCode = i < 4 ? 8 : 7;
      db.run(
        `INSERT INTO officers (id, per_name, rank_code, job_code, in_service)
         VALUES (?, ?, ?, ?, 'Y')`,
        [officerId, PANEL_OFFICER_NAMES[i], rankCode, m.jobCode]
      );
    });
    console.log('Seeded test officers (committee panel)');
  }

  PANEL_OFFICER_NAMES.forEach((name, i) => renameSeededOfficer(900001 + i, name));
  COMMITTEE_PANEL.forEach(m => renamePanelPosition(m.slot, m.jobCode, m.position));

  saveDB();
}

// Fixed nashra date for the test bulletin. Create a tagdded committee with this
// date so "تحميل الضباط" loads these officers.
export const TEST_NASHRA_DATE = '2026-06-01';

// LEGACY / DISABLED: no longer called at startup (officers come from the real import now).
// Kept for manual/local use. Test evaluation officers + their nashra/bulletin rows plus a
// batch of reference/demo data, spread across KIND buckets and promotion types.
export async function seedTestNashraOfficers(): Promise<void> {
  const db = getDB();

  const nashraCount = db.exec('SELECT COUNT(*) FROM officers_in_nashra')[0]?.values[0]?.[0] as number;

  // rankCode = current rank; kinC/spebC drive the KIND filter buckets:
  //   بحري: kin in (1,4) & speb not in (6,7) | مهندس: kin=2 | فني: kin in (3,7) | مد/سا: kin=1 & speb in (6,7)
  const officers = [
    // عميد ترقي بحري
    { name: 'كريم أنور محمد الخولي', rankCode: 6, kinC: 1, spebC: 1, nashraRank: 4, nashraType: 1, nashraTagdeed: 0 },
    // عميد تجديد1 بحري
    { name: 'إيهاب رضا عبد الله قنديل', rankCode: 6, kinC: 4, spebC: 2, nashraRank: 4, nashraType: 2, nashraTagdeed: 1 },
    // عميد تجديد2 مهندس
    { name: 'مصطفى جمال حسين البنا', rankCode: 6, kinC: 2, spebC: 0, nashraRank: 4, nashraType: 2, nashraTagdeed: 2 },
    // عميد تجديد3 فني
    { name: 'عصام رمضان علي المرسي', rankCode: 6, kinC: 3, spebC: 0, nashraRank: 4, nashraType: 2, nashraTagdeed: 3 },
    // عميد تجديد4 فني
    { name: 'مجدي زكريا عبد الوهاب صابر', rankCode: 6, kinC: 7, spebC: 0, nashraRank: 4, nashraType: 2, nashraTagdeed: 4 },
    // عميد ترقي مد/سا
    { name: 'سامح توفيق محمد عوض', rankCode: 6, kinC: 1, spebC: 6, nashraRank: 4, nashraType: 1, nashraTagdeed: 0 },
    // عقيد ترقي بحري
    { name: 'أيمن عبد الناصر سعد غانم', rankCode: 5, kinC: 1, spebC: 3, nashraRank: 5, nashraType: 1, nashraTagdeed: 0 },
    // عقيد تجديد2 مهندس
    { name: 'حاتم كمال عبد المنعم الجزار', rankCode: 5, kinC: 2, spebC: 0, nashraRank: 5, nashraType: 2, nashraTagdeed: 2 },
    // عقيد تجديد3 فني
    { name: 'رامي فتحي إبراهيم بدوي', rankCode: 5, kinC: 3, spebC: 0, nashraRank: 5, nashraType: 2, nashraTagdeed: 3 },
    // عقيد تجديد4 مد/سا
    { name: 'نادر مدحت عبد الستار شومان', rankCode: 5, kinC: 1, spebC: 7, nashraRank: 5, nashraType: 2, nashraTagdeed: 4 },
    // عقيد ترقي بحري
    { name: 'باسم عاطف محمود الششتاوي', rankCode: 5, kinC: 4, spebC: 1, nashraRank: 5, nashraType: 1, nashraTagdeed: 0 },
    // Rank-3 (لواء) officer: taraky_c < 3, should be EXCLUDED by the load filter.
    { name: 'جمال حسني عبد الرحمن الطوخي', rankCode: 7, kinC: 1, spebC: 1, nashraRank: 3, nashraType: 1, nashraTagdeed: 0 },
  ];

  if (nashraCount === 0) {
    officers.forEach((o, i) => {
      const officerId = 900101 + i;
      db.run(
        `INSERT INTO officers (id, per_name, rank_code, kind_code, spec_branch_code, akdam_no, weight, height, in_service)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Y')`,
        [officerId, o.name, o.rankCode, o.kinC, o.spebC, i + 1, 78 + i, 176 + (i % 6)]
      );
      db.run(
        `INSERT INTO officers_in_nashra (officer_id, nashra_date, nashra_rank, nashra_type, nashra_tagdeed)
         VALUES (?, ?, ?, ?, ?)`,
        [officerId, TEST_NASHRA_DATE, o.nashraRank, o.nashraType, o.nashraTagdeed]
      );
    });
    console.log('Seeded test nashra officers');
  }

  // Idempotent backfill of fitness + career-evaluation breakdown (takyeem_scores =
  // legacy NASHRA_OFFICERS_TAKYEEM) so the member officer panel has data. Runs even
  // on an existing DB (guarded by takyeem_scores) without wiping other data.
  const takyeemCount = db.exec('SELECT COUNT(*) FROM takyeem_scores')[0]?.values[0]?.[0] as number;
  if (takyeemCount === 0) {
    officers.forEach((o, i) => {
      const officerId = 900101 + i;
      db.run('UPDATE officers SET weight = ?, height = ? WHERE id = ?', [78 + i, 176 + (i % 6), officerId]);
      const jobs = 200 + i * 4, tahil = 120, kafaa = 300 - i * 5, passat = 70 + i,
        gazat = i % 3 === 0 ? 0 : 10, awsama = 40, tashkeelat = 60 + i * 2;
      const total = jobs + tahil + kafaa + passat + gazat + awsama + tashkeelat;
      db.run(
        `INSERT INTO takyeem_scores
           (officer_id, kafaa, jobs, tashkeelat, tahil, passat, awsama, gazat, total, off_order, nashra_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [officerId, kafaa, jobs, tashkeelat, tahil, passat, awsama, gazat, total, i + 1, TEST_NASHRA_DATE]
      );
    });
    console.log('Seeded test takyeem scores');
  }

  // Idempotent backfill of CV sub-records (jobs held / efficiency / missions /
  // punishments / health) for a few test officers so the CV + punishments render.
  const cvOfficers = [900101, 900103, 900105];
  const isEmpty = (t: string) => ((db.exec(`SELECT COUNT(*) FROM ${t}`)[0]?.values[0]?.[0] as number) ?? 0) === 0;

  if (isEmpty('officer_holder_wazayef')) {
    cvOfficers.forEach(id => {
      db.run('INSERT INTO officer_holder_wazayef (officer_id, ran_n, unt_n, job_n, ran_n_mrtb, wasfia_tuahel_trky, from_date, to_date, year, month) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, 'عقيد', 'وحدة بحرية', 'قائد وحدة', 'عقيد', null, '2018-01-01', '2021-12-31', 4, 0]);
      db.run('INSERT INTO officer_holder_wazayef (officer_id, ran_n, unt_n, job_n, ran_n_mrtb, wasfia_tuahel_trky, from_date, to_date, year, month) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [id, 'عميد', 'الأسطول الشمالي', 'رئيس فرع', 'عميد', 'ترقي عميد', '2022-01-01', null, 3, 0]);
    });
  }
  if (isEmpty('officer_kafaa')) {
    cvOfficers.forEach(id => {
      db.run('INSERT INTO officer_kafaa (officer_id, from_date_c, to_date, mosdak, kaed, from_date, grade_com) VALUES (?,?,?,?,?,?,?)',
        [id, '01-2022', '12-2022', 88, 90, '2022-01-01', 'ممتاز']);
      db.run('INSERT INTO officer_kafaa (officer_id, from_date_c, to_date, mosdak, kaed, from_date, grade_com) VALUES (?,?,?,?,?,?,?)',
        [id, '01-2023', '12-2023', 84, 85, '2023-01-01', 'جيد جدا']);
    });
  }
  if (isEmpty('officer_holder_paasat')) {
    cvOfficers.forEach(id => {
      db.run('INSERT INTO officer_holder_paasat (officer_id, activ_name, activ_note, activ_code, date_from, date_to, country_name) VALUES (?,?,?,?,?,?,?)',
        [id, 'بعثة', 'دورة القادة والأركان', 1, '2020-09-01', '2021-06-30', 'مصر']);
    });
  }
  if (isEmpty('officer_punishments_geza')) {
    db.run('INSERT INTO officer_punishments_geza (officer_id, gaza) VALUES (?,?)',
      [900105, 'بتاريخ 10-05-2019 - محاكمة - مخالفة إدارية - إنذار']);
    db.run('INSERT INTO officer_punishments_geza (officer_id, gaza) VALUES (?,?)',
      [900105, 'بتاريخ 15-03-2020 - جزاء - لفت نظر - رفع']);
  }
  if (isEmpty('officer_holder_health')) {
    cvOfficers.forEach(id => {
      db.run('INSERT INTO officer_holder_health (officer_id, se7a) VALUES (?,?)',
        [id, 'بتاريخ 01-02-2021 - كشف دوري - لائق طبياً']);
    });
  }
  cvOfficers.forEach(id => {
    db.run(
      "UPDATE officers SET marital_status = 'متزوج', boy_no = 2, girl_no = 1, main_qualify_spec = 'بحرية' WHERE id = ? AND (main_qualify_spec IS NULL OR main_qualify_spec = '')",
      [id]
    );
  });

  // Reference data for the automatic استيفاء engine so it yields a realistic mix.
  const isEmptyT = (t: string) => ((db.exec(`SELECT COUNT(*) FROM ${t}`)[0]?.values[0]?.[0] as number) ?? 0) === 0;
  if (isEmptyT('mrtb')) {
    [23, 26, 35, 36, 37, 293].forEach(c =>
      db.run('INSERT INTO tahilc (tahc_c, tahc_n) VALUES (?, ?)', [c, 'مؤهل ' + c])
    );
    [[1, 4], [2, 5], [3, 6]].forEach(([l, p]) =>
      db.run('INSERT INTO joblevel_promotion (level_c, promotes_to) VALUES (?, ?)', [l, p])
    );
    officers.forEach((o, i) => {
      const officerId = 900101 + i;
      const jobC = 5001 + i;
      db.run('UPDATE officers SET job_code = ? WHERE id = ?', [jobC, officerId]);
      // Specialization path applies to بحري/مهندس (kind 1/2); takhasos=2 (needs a qualifying course).
      const takhasos = o.kinC === 1 || o.kinC === 2 ? 2 : null;
      db.run(
        `INSERT INTO mrtb (job_c, ran_c, jobs_takhasoseya, taraky_c, taraky_c_suggested, level_c_daleel, level_c_suggested)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [jobC, o.rankCode, takhasos, null, null, null, null]
      );
      // Give even-indexed kind 1/2 officers the required qualification code -> مستوف; others غير مستوف.
      if (takhasos === 2 && i % 2 === 0) {
        db.run('INSERT INTO tahil (officer_id, tahc_c) VALUES (?, ?)', [officerId, o.nashraRank === 5 ? 23 : 36]);
      }
    });
    console.log('Seeded test استيفاء reference data');
  }

  // Demo job-history so the qualifying job (الوظيفة المؤهلة) resolves for a few officers.
  // Without an imported nah_rankd_tmp the legacy Get_Off_Moktarah_Estifa_JOB shows 'لا يكن';
  // this seeds a قائد فرقة بحرية job (taraky_c = 1 so it always qualifies) for three officers.
  if (isEmptyT('nah_rankd_tmp')) {
    db.run("INSERT OR IGNORE INTO jobs (job_c, job_n) VALUES (5901, 'قائد فرقة بحرية')");
    db.run(
      `INSERT OR IGNORE INTO mrtb (job_c, ran_c, jobs_takhasoseya, taraky_c, taraky_c_suggested, level_c_daleel, level_c_suggested)
       VALUES (5901, 5, NULL, 1, 1, NULL, NULL)`
    );
    for (const id of [900101, 900103, 900105]) {
      db.run(
        "INSERT INTO nah_rankd_tmp (officer_id, job_c, rank_c, date1, date2) VALUES (?, 5901, 5, '2019-01-01', '2022-12-31')",
        [id]
      );
    }
    console.log('Seeded test job-history for الوظيفة المؤهلة');
  }

  // Demo الوظائف السابقة for officer 900104. المرتب (ran_n_mrtb) and "الوظيفة تؤهل للترقي"
  // (wasfia_tuahel_trky) are stored directly now, so no mrtb / job_c scaffolding is needed.
  const waz104 = (db.exec("SELECT COUNT(*) FROM officer_holder_wazayef WHERE officer_id = 900104")[0]?.values[0]?.[0] as number) ?? 0;
  if (waz104 === 0) {
    db.run(
      "INSERT INTO officer_holder_wazayef (officer_id, ran_n, unt_n, job_n, ran_n_mrtb, wasfia_tuahel_trky, from_date, to_date, year, month) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [900104, 'مقدم', 'قاعدة سفاجا البحرية', 'رئيس فرع عمليات', 'عقيد', 'ترقي عقيد', '2018-01-01', '2021-06-30', 3, 5]
    );
    db.run(
      "INSERT INTO officer_holder_wazayef (officer_id, ran_n, unt_n, job_n, ran_n_mrtb, wasfia_tuahel_trky, from_date, to_date, year, month) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [900104, 'رائد', 'الأسطول الشمالي', 'قائد كتيبة', 'رائد', null, '2014-03-01', '2017-12-31', 3, 9]
    );
    console.log('Seeded demo الوظائف السابقة (officer 900104)');
  }

  // Grade bands (legacy off.grades) for the kafaa المتوسط lookup (round(avg) -> band name).
  if (isEmptyT('grades')) {
    ([[1, 'امتياز', 90, 100], [2, 'جيد جدا', 80, 89], [3, 'جيد', 70, 79],
      [4, 'متوسط', 60, 69], [5, 'مقبول', 50, 59], [6, 'ضعيف', 0, 49]] as [number, string, number, number][])
      .forEach(([id, name, f, t]) =>
        db.run('INSERT INTO grades (grade_id, grade_name, from_range, to_range) VALUES (?, ?, ?, ?)', [id, name, f, t]));
    console.log('Seeded grade bands');
  }

  // Demo تقارير الكفاءة for officer 900104 (avg -> جيد جدا). Stored verbatim: KAED/MOSDAK
  // ratings, MM-YYYY period, and the التقدير text.
  const kafaa104 = (db.exec("SELECT COUNT(*) FROM officer_kafaa WHERE officer_id = 900104")[0]?.values[0]?.[0] as number) ?? 0;
  if (kafaa104 === 0) {
    db.run(
      "INSERT INTO officer_kafaa (officer_id, from_date_c, to_date, mosdak, kaed, from_date, grade_com) VALUES (?,?,?,?,?,?,?)",
      [900104, '01-2022', '12-2022', 86, 88, '2022-01-01', 'جيد جدا']
    );
    db.run(
      "INSERT INTO officer_kafaa (officer_id, from_date_c, to_date, mosdak, kaed, from_date, grade_com) VALUES (?,?,?,?,?,?,?)",
      [900104, '01-2021', '12-2021', 80, 82, '2021-01-01', 'جيد جدا']
    );
    console.log('Seeded demo تقارير الكفاءة (officer 900104)');
  }

  // Demo البعثات والمأموريات: foreign missions for officer 900101 (locals already get مصر above).
  const paasat101 = (db.exec("SELECT COUNT(*) FROM officer_holder_paasat WHERE officer_id = 900101 AND country_name <> 'مصر'")[0]?.values[0]?.[0] as number) ?? 0;
  if (paasat101 === 0) {
    db.run(
      "INSERT INTO officer_holder_paasat (officer_id, activ_name, activ_note, activ_code, date_from, date_to, country_name) VALUES (?,?,?,?,?,?,?)",
      [900101, 'بعثة', 'دورة تدريبية بحرية متقدمة', 1, '2018-03-01', '2018-09-30', 'فرنسا']
    );
    db.run(
      "INSERT INTO officer_holder_paasat (officer_id, activ_name, activ_note, activ_code, date_from, date_to, country_name) VALUES (?,?,?,?,?,?,?)",
      [900101, 'مأمورية', 'مأمورية خارجية', 3, '2016-01-01', '2016-06-30', 'الولايات المتحدة']
    );
    console.log('Seeded demo البعثات والمأموريات (officer 900101)');
  }

  // Full CV demo for officer 900111 (باسم — عقيد ترقي بحري) so every tab shows data.
  if ((db.exec("SELECT COUNT(*) FROM officer_holder_wazayef WHERE officer_id = 900111")[0]?.values[0]?.[0] as number) === 0) {
    // الوظائف السابقة (المرتب + الوظيفة تؤهل للترقي stored directly)
    db.run("INSERT INTO officer_holder_wazayef (officer_id, ran_n, unt_n, job_n, ran_n_mrtb, wasfia_tuahel_trky, from_date, to_date, year, month) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [900111, 'عقيد', 'قاعدة الإسكندرية البحرية', 'رئيس فرع عمليات', 'عميد', 'ترقي عميد', '2019-06-01', '2022-12-31', 3, 6]);
    db.run("INSERT INTO officer_holder_wazayef (officer_id, ran_n, unt_n, job_n, ran_n_mrtb, wasfia_tuahel_trky, from_date, to_date, year, month) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [900111, 'مقدم', 'الأسطول الجنوبي', 'قائد كتيبة', 'رائد', null, '2015-01-01', '2019-05-31', 4, 4]);
    // تقارير الكفاءة (avg -> جيد جدا)
    db.run("INSERT INTO officer_kafaa (officer_id, from_date_c, to_date, mosdak, kaed, from_date, grade_com) VALUES (?,?,?,?,?,?,?)",
      [900111, '01-2022', '12-2022', 90, 92, '2022-01-01', 'امتياز']);
    db.run("INSERT INTO officer_kafaa (officer_id, from_date_c, to_date, mosdak, kaed, from_date, grade_com) VALUES (?,?,?,?,?,?,?)",
      [900111, '01-2021', '12-2021', 84, 86, '2021-01-01', 'جيد جدا']);
    // البعثات والمأموريات
    db.run("INSERT INTO officer_holder_paasat (officer_id, activ_name, activ_note, activ_code, date_from, date_to, country_name) VALUES (?,?,?,?,?,?,?)",
      [900111, 'بعثة', 'دورة القادة والأركان', 1, '2020-09-01', '2021-06-30', 'مصر']);
    db.run("INSERT INTO officer_holder_paasat (officer_id, activ_name, activ_note, activ_code, date_from, date_to, country_name) VALUES (?,?,?,?,?,?,?)",
      [900111, 'بعثة', 'دورة بحرية متقدمة', 1, '2017-02-01', '2017-08-31', 'إيطاليا']);
    // المحاكمات / الجزاءات
    db.run("INSERT INTO officer_punishments_geza (officer_id, gaza) VALUES (?,?)",
      [900111, 'بتاريخ 10-07-2018 - محاكمة - مخالفة إدارية - إنذار']);
    db.run("INSERT INTO officer_punishments_geza (officer_id, gaza) VALUES (?,?)",
      [900111, 'بتاريخ 20-11-2019 - جزاء - لفت نظر - رفع']);
    // الحالة الصحية
    db.run("INSERT INTO officer_holder_health (officer_id, se7a) VALUES (?,?)",
      [900111, 'بتاريخ 01-05-2021 - كشف دوري - لائق طبياً']);
    // البيانات الأساسية (family + qualification)
    db.run("UPDATE officers SET marital_status = 'متزوج', boy_no = 2, girl_no = 2, main_qualify_spec = 'بحرية' WHERE id = 900111");
    console.log('Seeded full CV demo for officer 900111');
  }

  // Reference/sample data for the voting-screen indicators (medical fitness / retirement
  // wish / leadership deficiency). Guarded on the new twsia_result table so it runs once.
  if (isEmptyT('twsia_result')) {
    ([[1, 'غير لائق للخدمة العسكرية'], [2, 'لائق لخدمات محدودة'], [5, 'غير لائق نهائياً'],
      [6, 'لائق مع تحفظات'], [7, 'إصابة أثناء الخدمة'], [9, 'مرض مزمن'],
      [46, 'إعادة العرض على المجلس الطبي']] as [number, string][])
      .forEach(([c, n]) => db.run('INSERT INTO twsia_result (result_c, result_n) VALUES (?, ?)', [c, n]));

    // One officer with a medical concern -> LYAKA (اللياقة الطبية) indicator shows.
    db.run('INSERT INTO twsia (officer_id, result_c, desease_date, tws_date_app) VALUES (?,?,?,?)',
      [900103, 6, '2024-03-01', '2024-03-10']);
    db.run('INSERT INTO twsia (officer_id, result_c, desease_date, tws_date_app) VALUES (?,?,?,?)',
      [900103, 2, '2023-05-01', '2023-05-10']);

    // One officer wishes retirement -> get_off_raghba (الرغبة) indicator shows.
    db.run("UPDATE takyeem_scores SET dont_want = 'y' WHERE officer_id = ? AND nashra_date = ?",
      [900104, TEST_NASHRA_DATE]);

    // Leadership (فرقة القادة): give one عميد-candidate the course (KYADA suppressed),
    // leave others without so the deficiency note shows for eligible عميد-ترقي officers.
    db.run("INSERT OR IGNORE INTO tahilc (tahc_c, tahc_n) VALUES (?, ?)", [40, 'فرقة القادة والأركان']);
    db.run('INSERT INTO tahil (officer_id, tahc_c) VALUES (?, ?)', [900101, 40]);

    // One عميد-candidate holds a doctorate -> KYADA suppressed for him.
    db.run('INSERT INTO derasat_olia (officer_id, type, mawkaf) VALUES (?, 1, 1)', [900107]);

    console.log('Seeded test indicator reference data');
  }

  // Job-level ladder (المستوى الوظيفى) names for the commander's "المستويات الوظيفية"
  // reference grid, and a per-officer current level via mrtb.level_c_daleel.
  const jlNamed = (db.exec('SELECT COUNT(*) FROM joblevel_promotion WHERE level_n IS NOT NULL')[0]?.values[0]?.[0] as number) ?? 0;
  if (jlNamed === 0) {
    const levels: [number, number | null, number, string, number][] = [
      [1, 2, 2, 'قائد وحدة / سفينة', 1],
      [2, 3, 2, 'رئيس فرع', 1],
      [3, 4, 2, 'رئيس شعبة', 2],
      [4, 5, 2, 'مدير إدارة', 2],
      [5, 6, 2, 'قائد لواء / أسطول', 3],
      [6, null, 2, 'قائد قاعدة / قوة', 3],
    ];
    levels.forEach(([lc, pt, pk, ln, cat]) => {
      db.run(
        `INSERT INTO joblevel_promotion (level_c, promotes_to, promotes_kin_c, level_n, category)
         VALUES (?,?,?,?,?)
         ON CONFLICT(level_c) DO UPDATE SET promotes_to = excluded.promotes_to,
           promotes_kin_c = excluded.promotes_kin_c, level_n = excluded.level_n, category = excluded.category`,
        [lc, pt, pk, ln, cat]
      );
    });
    // Give each test officer's job a current level (level_c_daleel) so the grid can mark it.
    officers.forEach((o, i) => {
      db.run('UPDATE mrtb SET level_c_daleel = ? WHERE job_c = ?', [(i % 6) + 1, 5001 + i]);
    });
    console.log('Seeded job-level ladder');
  }

  // Data-completeness tracker (EVAL_OFFICERS_REQUIREMENTS): a realistic mix of complete
  // and incomplete officers. family_photo/sheet_121/awsama flags here; personal photo +
  // kafaa reports are computed from real data by the endpoint.
  if (isEmptyT('officer_requirements')) {
    // [family_photo, sheet_121, awsama, notes]
    const reqs: Record<number, [number, number, number, string]> = {
      900101: [1, 1, 1, ''],
      900102: [0, 1, 1, 'ينقصه الصورة العائلية'],
      900103: [1, 0, 1, 'ينقصه 121 ش ض'],
      900104: [1, 1, 0, 'تنقصه بيانات الأنواط'],
      900105: [0, 0, 1, 'ينقصه الصورة العائلية و 121 ش ض'],
      900106: [1, 1, 1, ''],
      900107: [1, 1, 1, ''],
      900108: [0, 1, 1, 'ينقصه الصورة العائلية'],
      900109: [1, 1, 1, ''],
      900110: [1, 0, 1, 'ينقصه 121 ش ض'],
      900111: [1, 1, 1, ''],
    };
    Object.entries(reqs).forEach(([id, [fp, s121, aw, notes]]) => {
      db.run('INSERT INTO officer_requirements (officer_id, family_photo, sheet_121, awsama, notes) VALUES (?,?,?,?,?)',
        [Number(id), fp, s121, aw, notes]);
    });
    console.log('Seeded officer requirements');
  }

  // --- Enrichment so loaded officers display full السلاح/الوحدة/الوظيفة/الأقدمية ---
  if (isEmpty('kindoff')) {
    ([[1, 'بحري'], [2, 'مهندس'], [3, 'فني'], [4, 'بحري تخصصي'], [5, 'قتالي'], [6, 'طبي'],
      [7, 'فني اتصالات'], [8, 'إدارة'], [9, 'مالي'], [10, 'قانوني'], [11, 'لوجستي'], [12, 'أخرى']] as [number, string][])
      .forEach(([c, n]) => db.run('INSERT INTO kindoff (kin_c, kin_n) VALUES (?, ?)', [c, n]));
    console.log('Seeded kindoff');
  }
  if (isEmpty('units')) {
    ([[1, 'القوات البحرية'], [2, 'الأسطول الشمالي'], [3, 'الأسطول الجنوبي'],
      [4, 'قاعدة الإسكندرية البحرية'], [5, 'قاعدة الغردقة البحرية'], [6, 'قاعدة سفاجا البحرية']] as [number, string][])
      .forEach(([c, n]) => db.run('INSERT INTO units (unt_c, unt_n) VALUES (?, ?)', [c, n]));
    console.log('Seeded units');
  }

  const jobNames = ['قائد وحدة بحرية', 'رئيس فرع عمليات', 'رئيس فرع تدريب', 'قائد لنش صواريخ',
    'رئيس فرع فني', 'مدير إدارة', 'قائد فرقاطة', 'رئيس فرع تنظيم'];
  const ensureJob = (jobC: number, name: string) => {
    const ex = (db.exec('SELECT 1 FROM jobs WHERE job_c = ?', [jobC])[0]?.values.length ?? 0) > 0;
    if (!ex) db.run('INSERT INTO jobs (job_c, job_n) VALUES (?, ?)', [jobC, name]);
  };

  // Backfill org fields on the existing test officers (idempotent via COALESCE).
  officers.forEach((_, i) => {
    const officerId = 900101 + i;
    const jobC = 5001 + i;
    ensureJob(jobC, jobNames[i % jobNames.length]);
    db.run(
      `UPDATE officers SET unit_code = COALESCE(unit_code, ?), job_code = COALESCE(job_code, ?),
                           akdam_rep = COALESCE(akdam_rep, ?) WHERE id = ?`,
      [2 + (i % 5), jobC, 'أ', officerId]
    );
  });

  // Additional test officers (idempotent by id) so the committee has more variety.
  const moreOfficers = [
    // عميد تجديد بحري
    { id: 900113, name: 'علاء سعيد محمد المليجي', rankCode: 6, kinC: 1, spebC: 1, unitC: 2, nashraRank: 4, nashraType: 2, nashraTagdeed: 2 },
    // عميد ترقي مهندس
    { id: 900114, name: 'وليد شوقي عبد الحكيم سلطان', rankCode: 6, kinC: 2, spebC: 0, unitC: 3, nashraRank: 4, nashraType: 1, nashraTagdeed: 0 },
    // عقيد تجديد فني
    { id: 900115, name: 'محمد ثروت أمين شعبان', rankCode: 5, kinC: 3, spebC: 0, unitC: 4, nashraRank: 5, nashraType: 2, nashraTagdeed: 4 },
    // عقيد ترقي بحري
    { id: 900116, name: 'أحمد يسري عبد المجيد الفقي', rankCode: 5, kinC: 1, spebC: 3, unitC: 5, nashraRank: 5, nashraType: 1, nashraTagdeed: 0 },
    // عميد تجديد قتالي
    { id: 900117, name: 'خالد مأمون عبد الخالق سرور', rankCode: 6, kinC: 5, spebC: 0, unitC: 6, nashraRank: 4, nashraType: 2, nashraTagdeed: 3 },
    // عقيد تجديد بحري
    { id: 900118, name: 'عماد صبحي محمد الحلواني', rankCode: 5, kinC: 4, spebC: 1, unitC: 2, nashraRank: 5, nashraType: 2, nashraTagdeed: 2 },
  ];
  moreOfficers.forEach((o, j) => {
    const jobC = 5101 + j;
    ensureJob(jobC, jobNames[(j + 3) % jobNames.length]);
    db.run(
      `INSERT OR IGNORE INTO officers
         (id, per_name, rank_code, kind_code, spec_branch_code, unit_code, job_code, akdam_no, akdam_rep, weight, height, in_service)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ب', ?, ?, 'Y')`,
      [o.id, o.name, o.rankCode, o.kinC, o.spebC, o.unitC, jobC, 13 + j, 79 + j, 176 + (j % 6)]
    );
    db.run(
      `INSERT OR IGNORE INTO officers_in_nashra (officer_id, nashra_date, nashra_rank, nashra_type, nashra_tagdeed)
       VALUES (?, ?, ?, ?, ?)`,
      [o.id, TEST_NASHRA_DATE, o.nashraRank, o.nashraType, o.nashraTagdeed]
    );
    const hasT = (db.exec('SELECT 1 FROM takyeem_scores WHERE officer_id = ? AND nashra_date = ?', [o.id, TEST_NASHRA_DATE])[0]?.values.length ?? 0) > 0;
    if (!hasT) {
      const jobs = 210 + j * 5, tahil = 120, kafaa = 290 - j * 4, passat = 72 + j,
        gazat = j % 2 === 0 ? 0 : 10, awsama = 45, tashkeelat = 64 + j * 2;
      const total = jobs + tahil + kafaa + passat + gazat + awsama + tashkeelat;
      db.run(
        `INSERT INTO takyeem_scores
           (officer_id, kafaa, jobs, tashkeelat, tahil, passat, awsama, gazat, total, off_order, nashra_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o.id, kafaa, jobs, tashkeelat, tahil, passat, awsama, gazat, total, 13 + j, TEST_NASHRA_DATE]
      );
    }
  });

  // Officers that deliberately SHARE the same akdam_no (real bulletins allow this; akdam_rep is
  // the tiebreaker), with two also sharing the same name. Distinct officer_id each, so session
  // actions must target exactly one — used to validate the same-name/same-akdam bug is gone.
  const sameAkdamOfficers = [
    // 900119 / 900120 deliberately share one name (real bulletins have namesakes).
    { id: 900119, name: 'سعيد عبد الحليم محمد العدل', rankCode: 6, kinC: 1, spebC: 1, unitC: 2, akdamNo: 20, akdamRep: 'أ', nashraRank: 4, nashraType: 2, nashraTagdeed: 2 },
    { id: 900120, name: 'سعيد عبد الحليم محمد العدل', rankCode: 6, kinC: 1, spebC: 1, unitC: 3, akdamNo: 20, akdamRep: 'ب', nashraRank: 4, nashraType: 2, nashraTagdeed: 2 },
    { id: 900121, name: 'منصور عبد الرءوف حسن الشريف', rankCode: 5, kinC: 1, spebC: 3, unitC: 4, akdamNo: 20, akdamRep: 'ج', nashraRank: 5, nashraType: 1, nashraTagdeed: 0 },
  ];
  sameAkdamOfficers.forEach((o, j) => {
    const jobC = 5201 + j;
    ensureJob(jobC, jobNames[(j + 1) % jobNames.length]);
    db.run(
      `INSERT OR IGNORE INTO officers
         (id, per_name, rank_code, kind_code, spec_branch_code, unit_code, job_code, akdam_no, akdam_rep, weight, height, in_service)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Y')`,
      [o.id, o.name, o.rankCode, o.kinC, o.spebC, o.unitC, jobC, o.akdamNo, o.akdamRep, 82 + j, 176 + (j % 6)]
    );
    db.run(
      `INSERT OR IGNORE INTO officers_in_nashra (officer_id, nashra_date, nashra_rank, nashra_type, nashra_tagdeed)
       VALUES (?, ?, ?, ?, ?)`,
      [o.id, TEST_NASHRA_DATE, o.nashraRank, o.nashraType, o.nashraTagdeed]
    );
    const hasT = (db.exec('SELECT 1 FROM takyeem_scores WHERE officer_id = ? AND nashra_date = ?', [o.id, TEST_NASHRA_DATE])[0]?.values.length ?? 0) > 0;
    if (!hasT) {
      const jobs = 205 + j * 4, tahil = 118, kafaa = 285 - j * 3, passat = 70 + j,
        gazat = j % 2 === 0 ? 0 : 8, awsama = 44, tashkeelat = 60 + j * 2;
      const total = jobs + tahil + kafaa + passat + gazat + awsama + tashkeelat;
      db.run(
        `INSERT INTO takyeem_scores
           (officer_id, kafaa, jobs, tashkeelat, tahil, passat, awsama, gazat, total, off_order, nashra_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [o.id, kafaa, jobs, tashkeelat, tahil, passat, awsama, gazat, total, 20 + j, TEST_NASHRA_DATE]
      );
    }
  });

  officers.forEach((o, i) => renameSeededOfficer(900101 + i, o.name));
  [...moreOfficers, ...sameAkdamOfficers].forEach(o => renameSeededOfficer(o.id, o.name));

  // ELASASY text backfill: officers are now imported as denormalized text, so the display +
  // committee loading read full_rank/unt_n/job_n/speciality/… and taraky_c. In dev there is
  // no real import, so derive those from the seeded lookups + bulletin rows for demo officers.
  db.run(
    `UPDATE officers SET
       full_rank = COALESCE(full_rank, (SELECT ran_n FROM ranks WHERE ran_c = officers.rank_code), 'عقيد'),
       unt_n = COALESCE(unt_n, (SELECT unt_n FROM units WHERE unt_c = officers.unit_code)),
       job_n = COALESCE(job_n, (SELECT job_n FROM jobs WHERE job_c = officers.job_code)),
       speciality = COALESCE(speciality, (SELECT speb_n FROM specializations WHERE speb_c = officers.spec_branch_code), 'بحرية'),
       akdameya = COALESCE(akdameya, CAST(akdam_no AS TEXT) || COALESCE(akdam_rep, '')),
       nashra_date = COALESCE(nashra_date, ?),
       marital_status = COALESCE(marital_status, 'متزوج'),
       wife_status = COALESCE(wife_status, 'لا تعمل'),
       fark_wazn = COALESCE(fark_wazn, CASE WHEN weight IS NOT NULL AND height IS NOT NULL THEN weight + 100 - height END),
       mil_qualification = COALESCE(mil_qualification, main_qualify_spec, 'دورة أركان - جيد جدا'),
       taraky_estifa = COALESCE(taraky_estifa, 'الضابط مستوفى'),
       tawsya_ka2ed = COALESCE(tawsya_ka2ed, 'يوصى بالإحالة'),
       ra8ba_twsia = COALESCE(ra8ba_twsia, 'يوصى بالإحالة'),
       is_deleted = COALESCE(is_deleted, 0)
     WHERE id BETWEEN 900001 AND 900999`,
    [TEST_NASHRA_DATE]
  );

  // taraky_c + taraky_tagdeed from each demo officer's bulletin row (legacy getTaraky_c).
  const oinForTaraky = db.exec(
    'SELECT officer_id, nashra_rank, nashra_type, nashra_tagdeed FROM officers_in_nashra'
  );
  if (oinForTaraky.length && oinForTaraky[0].values.length) {
    for (const row of oinForTaraky[0].values as any[][]) {
      const tc = getTarakyC(Number(row[1]), Number(row[2]), Number(row[3]));
      if (tc == null) continue;
      const tagdeed = LAGNA_TYPE_MAP.find(t => t.tarakyC === tc)?.tarakyN ?? null;
      db.run(
        'UPDATE officers SET taraky_c = COALESCE(taraky_c, ?), taraky_tagdeed = COALESCE(taraky_tagdeed, ?) WHERE id = ?',
        [tc, tagdeed, row[0]]
      );
    }
  }

  // Sample portrait (SVG head-and-shoulders silhouette) for every demo officer (9000xx range)
  // with no stored photo, so the decisions-card report and voting screens show a picture.
  // Scoped to the demo range and guarded by `photo IS NULL`, so it is idempotent and never
  // overwrites a real imported photo.
  const noPhoto = db.exec('SELECT id FROM officers WHERE id BETWEEN 900001 AND 900999 AND photo IS NULL');
  if (noPhoto.length && noPhoto[0].values.length) {
    for (const row of noPhoto[0].values as any[][]) {
      const oid = Number(row[0]);
      const hue = (oid * 47) % 360;
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">` +
        `<rect width="300" height="400" fill="hsl(${hue},30%,88%)"/>` +
        `<circle cx="150" cy="146" r="64" fill="hsl(${hue},34%,58%)"/>` +
        `<path d="M54 400 C54 304 108 264 150 264 C192 264 246 304 246 400 Z" fill="hsl(${hue},34%,58%)"/>` +
        `</svg>`;
      db.run('UPDATE officers SET photo = ? WHERE id = ?', [new TextEncoder().encode(svg), oid]);
    }
    console.log(`Seeded sample officer photos (${noPhoto[0].values.length})`);
  }

  saveDB();
}
