import { Router, Response } from 'express';
import { getDB, saveDB } from '../db/connection.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { finalDecision, tamseelDecision } from '../config/decision.js';
import { finalizeTagddedDecisions } from '../services/scoringService.js';
import { getBasis, totalMax, getServiceScore } from '../services/serviceScoreService.js';
import { backupCommittee } from '../services/backupService.js';
import { detectDisputes } from '../services/disputeService.js';
import { isCommanderSeat, deputyOf } from '../config/commander.js';

const router = Router();
router.use(authenticate);

function mapRows(results: any[]): Record<string, any>[] {
  if (!results.length || !results[0].values.length) return [];
  const cols: string[] = results[0].columns;
  return results[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
    return obj;
  });
}

// A زائر seat: watches the running session read-only. Resolved from the database rather
// than the JWT claim, so an older token can never talk its way past a write guard.
function isGuestUser(db: any, req: AuthRequest): boolean {
  if (req.user!.role !== 'member') return false;
  return (mapRows(db.exec(
    'SELECT is_guest FROM users WHERE id = ?', [req.user!.id]
  ))[0]?.is_guest as number) === 1;
}

// Access guard: members may only inspect an officer in their active committee. A guest
// holds no seat, so it is allowed any officer registered in the committee that is live.
function assertOfficerAccess(db: any, req: AuthRequest, officerId: number): boolean {
  if (req.user!.role !== 'member') return true;
  const ok = isGuestUser(db, req)
    ? mapRows(db.exec(
        `SELECT 1 FROM committee_officers co
         JOIN committees c ON c.id = co.committee_id
         WHERE c.is_active = 1 AND co.officer_id = ? LIMIT 1`,
        [officerId]
      ))
    : mapRows(db.exec(
        `SELECT 1 FROM committee_officers co
         JOIN committees c ON c.id = co.committee_id
         JOIN committee_member_assignments cma ON cma.committee_id = c.id
         WHERE c.is_active = 1 AND cma.user_id = ? AND cma.included = 1 AND co.officer_id = ? LIMIT 1`,
        [req.user!.id, officerId]
      ));
  return ok.length > 0;
}

// Committee chain (القائد → تمهيدية → رئيسية): each level's "previous" committee is the one
// one step earlier. رئيسية(0) follows تمهيدية(1) follows القائد(2); القائد has no previous.
const PREV_TAMHIDY_LEVEL: Record<number, number | null> = { 0: 1, 1: 2, 2: null };

// The previous committee in the chain = the tagdded committee of the previous tamhidy level
// sharing this committee's nashra_date (chain committees run off one نشرة import cycle, so the
// officer set / officer_id stays stable). A completed one wins over a still-running duplicate.
// Used to surface its final decision as a hint on the commander's voting screen.
function findPrevChainCommittee(db: any, tamhidy: number, nashraDate: string | null): Record<string, any> | null {
  const prev = PREV_TAMHIDY_LEVEL[Number(tamhidy) || 0];
  if (prev == null || !nashraDate) return null;
  return mapRows(db.exec(
    `SELECT id, tamhidy FROM committees
     WHERE committee_type = 'tagdded' AND tamhidy = ? AND nashra_date = ?
     ORDER BY (status = 'completed') DESC, id DESC LIMIT 1`,
    [prev, nashraDate]
  ))[0] ?? null;
}

// Officer warning indicators shown on the tagdded voting screen, ported faithfully
// from the EVAL_USER_OPINION_DETAIL form functions VERY_GEZA and CURRENT_KAFAA_TAKREER.
// Both are measured "during the current rank" (tariekh/from_date >= officers.date_rank).
function tagddedIndicators(
  db: any, officerId: number, nashraDate: string | null, tarakyN: string | null
): { mohakma: string; takreer: string; teby: string; raghba: string; kyada: string } {
  const off = mapRows(db.exec('SELECT date_rank, arkan, kind_code FROM officers WHERE id = ?', [officerId]))[0] || {};
  const dateRank = off.date_rank ?? null;
  let mohakma = '', takreer = '', teby = '', raghba = '', kyada = '';

  // المحاكمات/الجزاءات merged into one table (the date is inline in the text), so flag from
  // the presence of any entry rather than a date-scoped count.
  const gazaCnt = (mapRows(db.exec(
    'SELECT COUNT(*) c FROM officer_punishments_geza WHERE officer_id = ?',
    [officerId]
  ))[0]?.c as number) ?? 0;
  if (gazaCnt > 0) mohakma = 'الضابط عليه محاكمة/جزاء في السجل';

  if (dateRank) {

    // Legacy flags a "جيد" (code 3) efficiency report during the rank; grade_com holds the rating text.
    const jayed = (mapRows(db.exec(
      "SELECT COUNT(*) c FROM officer_kafaa WHERE officer_id = ? AND from_date >= ? AND grade_com = 'جيد'",
      [officerId, dateRank]
    ))[0]?.c as number) ?? 0;
    if (jayed > 0) takreer = 'الضابط حاصل على تقدير جيد في أحد تقارير الكفاءة أثناء الرتبة الحالية';
  }

  // LYAKA (اللياقة الطبية): latest twsia recommendation in the concern set -> its result_n.
  const med = mapRows(db.exec(
    `SELECT t.result_c FROM twsia t
     WHERE t.officer_id = ? AND t.result_c IN (1,2,5,6,7,9,46)
     ORDER BY COALESCE(t.desease_date, t.tws_date_app) DESC LIMIT 1`,
    [officerId]
  ))[0];
  if (med) {
    const r = mapRows(db.exec('SELECT result_n FROM twsia_result WHERE result_c = ?', [Number(med.result_c)]))[0];
    if (r?.result_n) teby = r.result_n as string;
  }

  // get_off_raghba (الرغبة): dont_want='y' on the officer's bulletin takyeem row.
  if (nashraDate) {
    const w = mapRows(db.exec(
      'SELECT dont_want FROM takyeem_scores WHERE officer_id = ? AND nashra_date = ? LIMIT 1',
      [officerId, nashraDate]
    ))[0];
    if (w && String(w.dont_want).toLowerCase() === 'y') raghba = 'الضابط لديه رغبة في الإحالة للتقاعد';
  }

  // KYADA_DOESN_HAVE (فرقة القادة for عميد promotion): only for arkan (nvl=1), non-technical,
  // no doctorate, not a brigade commander, up for ترقي عميد, and lacking the command course.
  const arkan = off.arkan == null ? '1' : String(off.arkan);
  const kind = off.kind_code != null ? Number(off.kind_code) : null;
  if (arkan === '1' && kind !== 3) {
    const doctorate = (mapRows(db.exec(
      'SELECT COUNT(*) c FROM derasat_olia WHERE officer_id = ? AND type = 1 AND mawkaf = 1', [officerId]
    ))[0]?.c as number) ?? 0;
    const jobN = mapRows(db.exec(
      'SELECT job_n FROM officers WHERE id = ?', [officerId]
    ))[0]?.job_n as string | undefined;
    const isBrigadeCmd = !!jobN && jobN.includes('قائد') && jobN.includes('لواء');
    const t = tarakyN || '';
    const isAmidPromotion = (t.includes('ترقي') || t.includes('ترقى')) && t.includes('عميد');
    if (doctorate === 0 && !isBrigadeCmd && isAmidPromotion) {
      const hasCourse = (mapRows(db.exec(
        `SELECT COUNT(*) c FROM tahil th JOIN tahilc tc ON th.tahc_c = tc.tahc_c
         WHERE th.officer_id = ? AND (tc.tahc_n LIKE '%القادة%' OR tc.tahc_n LIKE '%كان%')`, [officerId]
      ))[0]?.c as number) ?? 0;
      if (hasCourse === 0) kyada = 'الضابط لم يحصل على فرقة القادة - شرط الترقي لرتبة عميد';
    }
  }

  return { mohakma, takreer, teby, raghba, kyada };
}

// GET /current - the logged-in member's live voting context (active committee,
// current officer, their existing vote, progress). Drives the member screen poll.
router.get('/current', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const userId = req.user!.id;
  const isGuest = isGuestUser(db, req);

  const committeeCols =
    `c.id, c.committee_type, c.lagna_date, c.lagna_cat_c, c.tamhidy,
     c.nashra_date, c.prev_tamhidy_committee_id, c.is_active, c.status, c.training_year,
     cat.cat_n as lagna_cat_name`;
  const catJoins =
    `LEFT JOIN eval_lagna_cat cat ON c.lagna_cat_c = cat.cat_c`;

  // A guest holds no seat, so it watches whichever committee is live rather than its own.
  // Members get their latest committee (active one first, else the newest) so we can tell
  // "not started yet" apart from "just finished" when nothing is active.
  const committee = isGuest
    ? mapRows(db.exec(
        `SELECT ${committeeCols} FROM committees c ${catJoins} WHERE c.is_active = 1 LIMIT 1`
      ))[0]
    : mapRows(db.exec(
        `SELECT ${committeeCols}
         FROM committees c
         JOIN committee_member_assignments cma ON cma.committee_id = c.id
         ${catJoins}
         WHERE cma.user_id = ? AND cma.included = 1
         ORDER BY c.is_active DESC, c.id DESC
         LIMIT 1`,
        [userId]
      ))[0];

  if (!committee || committee.is_active !== 1) {
    // completed → show "finished" to everyone; draft/none → "waiting to start".
    const finished = committee?.status === 'completed';
    // A live committee this member isn't part of → tell the client to sign this seat
    // out. The login seat list only shows the active committee's members, so a member
    // who logged in before it started has no place in the running session. A guest is
    // never part of any committee, so it simply waits instead of being signed out.
    const activeExists = mapRows(db.exec(
      'SELECT 1 FROM committees WHERE is_active = 1 LIMIT 1'
    )).length > 0;
    const excluded = activeExists && req.user!.role === 'member' && !isGuest;
    res.json({ committee: null, activeOfficer: null, myVote: null, progress: null, finished, excluded });
    return;
  }

  const activeOfficer = mapRows(db.exec(
    `SELECT co.officer_id, co.serial, co.rank_name, co.officer_name, co.akdam_no, co.akdam_rep,
            co.unit_name, co.job_name, co.l_lagna_type_c, co.ta3n_type, co.done,
            co.estifa, co.estifa_auto, co.final_eval, co.kaed_tawsya, lt.taraky_n,
            COALESCE(co.target_job, o.activ_note) AS target_job, co.interview_date,
            o.off_notice, o.elhaq_unit
     FROM committee_officers co
     LEFT JOIN l_lagna_type lt ON co.l_lagna_type_c = lt.taraky_c
     LEFT JOIN officers o ON o.id = co.officer_id
     WHERE co.committee_id = ? AND co.is_active = 1 AND co.hidden = 0
     LIMIT 1`,
    [committee.id]
  ))[0] ?? null;

  // القرار النهائي (legacy TEXT_FIN_EVAL) exists on the commander screen only; the raw
  // code never leaves the server so a member's screen cannot reveal it early.
  if (activeOfficer) {
    const evalCode = activeOfficer.final_eval != null ? Number(activeOfficer.final_eval) : null;
    const decision = isCommanderSeat(req.user!.username)
      ? tamseelDecision(evalCode)
      : '';
    activeOfficer.final_decision = decision || null;
    // تصدق (final_eval = 1) is the positive outcome; لا يتصدق (2) is negative. No يؤجل here.
    activeOfficer.final_positive = decision ? evalCode === 1 : null;
    activeOfficer.final_postpone = null;
    delete activeOfficer.final_eval;

    // ملحق علي (elhaq_unit): the attachment unit is sensitive — expose the value only to the
    // commander seats (EVAL1/EVAL9). Every other viewer (members, guests, spectators) receives
    // null, so the value never reaches their client and the card shows the neutral empty state.
    activeOfficer.elhaq_unit = isCommanderSeat(req.user!.username)
      ? (activeOfficer.elhaq_unit ?? null)
      : null;
  }

  // Whether a prev/next officer exists, so the commander's nav buttons can disable at the ends.
  if (activeOfficer) {
    const s = activeOfficer.serial as number;
    activeOfficer.has_prev = mapRows(db.exec(
      'SELECT 1 FROM committee_officers WHERE committee_id = ? AND hidden = 0 AND serial < ? LIMIT 1',
      [committee.id, s]
    )).length > 0;
    activeOfficer.has_next = mapRows(db.exec(
      'SELECT 1 FROM committee_officers WHERE committee_id = ? AND hidden = 0 AND done = 0 AND serial > ? LIMIT 1',
      [committee.id, s]
    )).length > 0;
  }

  let myVote: Record<string, any> | null = null;
  if (activeOfficer) {
    myVote = isGuest ? null : mapRows(db.exec(
      `SELECT user_opinion, eval_state
       FROM member_votes WHERE committee_id = ? AND user_id = ? AND officer_id = ? AND ta3n_type = ?`,
      [committee.id, userId, activeOfficer.officer_id, activeOfficer.ta3n_type ?? 0]
    ))[0] ?? null;

    if (committee.committee_type === 'tagdded') {
      const x = mapRows(db.exec(
        `SELECT o.weight, o.height, o.fark_wazn, o.speciality as spec_name,
                o.mil_qualification, o.taraky_estifa, o.estifa_job, o.entedab,
                o.se7a, o.kafaa_takreer, o.mohakma_geza, o.kyada, o.ragba, o.ra8ba_twsia
         FROM officers o
         WHERE o.id = ?`,
        [activeOfficer.officer_id]
      ))[0] ?? {};

      const w = x.weight, h = x.height;
      // القرار السابق في السلسلة: shown only on the commander seats (EVAL1/EVAL9); resolved live
      // by nashra_date so no manual linking is needed. prelimLevel drives the screen's label.
      let prelim: string | null = null;
      let prelimLevel: number | null = null;
      if (isCommanderSeat(req.user!.username)) {
        const prevC = findPrevChainCommittee(db, committee.tamhidy, committee.nashra_date);
        if (prevC) {
          prelimLevel = Number(prevC.tamhidy);
          const prev = mapRows(db.exec(
            'SELECT final_eval, l_lagna_type_c FROM committee_officers WHERE committee_id = ? AND officer_id = ?',
            [prevC.id, activeOfficer.officer_id]
          ))[0];
          if (prev && prev.final_eval != null) {
            prelim = finalDecision(
              Number(prev.final_eval),
              prev.l_lagna_type_c != null ? Number(prev.l_lagna_type_c) : null
            ) || null;
          }
        }
      }

      activeOfficer.tagdded = {
        weight: w ?? null,
        height: h ?? null,
        tanasok: x.fark_wazn ?? (w != null && h != null ? w + 100 - h : null),
        branch: null,
        spec_name: x.spec_name ?? null,
        highest_tahil: x.mil_qualification ?? null,
        entedab: x.entedab ?? null,
        prelim_decision: prelim,
        prelim_level: prelimLevel,
        // الاستيفاء: imported verbatim (TARAKY_ESTIFA + ESTIFA_JOB), no longer computed.
        estifa: x.taraky_estifa ? (String(x.taraky_estifa).includes('غير مستوف') ? 0 : 1) : null,
        estifa_summary: (x.taraky_estifa as string) || '',
        qualifying_job: (x.estifa_job as string) || '',
        // اللياقة/المحاكمة/تقرير الكفاءة/الرغبة/القيادة/توصية القائد: imported verbatim text
        // (V_ALL_TAHIL / ra8ba_twsia), shown as-is on the voting card. Empty ones are dropped
        // client-side.
        indicators: {
          mohakma: (x.mohakma_geza as string) ?? null,
          takreer: (x.kafaa_takreer as string) ?? null,
          teby: (x.se7a as string) ?? null,
          raghba: (x.ragba as string) ?? null,
          kyada: (x.kyada as string) ?? null,
          tawsya: (x.ra8ba_twsia as string) ?? null,
        },
      };
    }
  }

  // التمثيل العسكري voting inputs: the committee بنود, this officer's admin-entered computed بنود
  // (مسير الخدمة % + لغة إنجليزية), this member's saved scores, and أعلى تأهيل for the card side panel.
  const evalItems = mapRows(db.exec(
    'SELECT id, serial, name, max_degree, kind, source FROM committee_eval_items WHERE committee_id = ? ORDER BY serial',
    [committee.id]
  ));
  if (activeOfficer) {
    const tq = mapRows(db.exec(
      'SELECT mil_qualification, civil_qualification FROM officers WHERE id = ?',
      [activeOfficer.officer_id]
    ))[0] ?? {};
    activeOfficer.highest_tahil_mil = tq.mil_qualification ?? null;
    activeOfficer.highest_tahil_civil = tq.civil_qualification ?? null;
    const ss = mapRows(db.exec(
      'SELECT pct, english FROM officer_service_score WHERE officer_id = ?',
      [activeOfficer.officer_id]
    ))[0];
    activeOfficer.service_score_pct = ss?.pct ?? null;
    activeOfficer.english_score = ss?.english ?? null;
    const scoreRows = isGuest ? [] : mapRows(db.exec(
      'SELECT item_id, score FROM member_item_scores WHERE committee_id = ? AND user_id = ? AND officer_id = ?',
      [committee.id, userId, activeOfficer.officer_id]
    ));
    activeOfficer.my_scores = Object.fromEntries(scoreRows.map((r: any) => [r.item_id, r.score]));
  }

  const total = (mapRows(db.exec(
    'SELECT COUNT(*) as c FROM committee_officers WHERE committee_id = ? AND hidden = 0',
    [committee.id]
  ))[0]?.c as number) ?? 0;
  // A guest casts no votes, so its counter tracks how far the session itself has got
  // (officers already closed) instead of a personal tally that would always read zero.
  // For a member, count only votes that still match a live officer case (officer +
  // ta3n_type); this excludes orphaned votes left when an officer is re-registered under a
  // different ta3n_type, which previously made "voted" exceed "total" (remaining went negative).
  const voted = isGuest
    ? (mapRows(db.exec(
        'SELECT COUNT(*) as c FROM committee_officers WHERE committee_id = ? AND hidden = 0 AND done = 1',
        [committee.id]
      ))[0]?.c as number) ?? 0
    : (mapRows(db.exec(
        `SELECT COUNT(*) as c FROM member_votes mv
         JOIN committee_officers co ON co.committee_id = mv.committee_id
           AND co.officer_id = mv.officer_id
           AND COALESCE(co.ta3n_type, 0) = COALESCE(mv.ta3n_type, 0)
           AND co.hidden = 0
         WHERE mv.committee_id = ? AND mv.user_id = ? AND mv.eval_state = 1`,
        [committee.id, userId]
      ))[0]?.c as number) ?? 0;

  // Live members' tally for the active officer (counts by user_opinion among included
  // members). Never sent to a guest — a spectator sees no running result.
  // For التمثيل the "tally" is scoring progress: how many included members finished their
  // scores (eval_state = 1), plus the commander's decision counts (user_opinion 1/0).
  let tally: Record<string, any> | null = null;
  if (activeOfficer && !isGuest) {
    const rows = mapRows(db.exec(
      `SELECT mv.eval_state, mv.user_opinion
       FROM member_votes mv
       JOIN committee_member_assignments cma
         ON cma.committee_id = mv.committee_id AND cma.user_id = mv.user_id
       WHERE mv.committee_id = ? AND mv.officer_id = ? AND mv.ta3n_type = ? AND cma.included = 1`,
      [committee.id, activeOfficer.officer_id, activeOfficer.ta3n_type ?? 0]
    ));
    const counts: Record<string, number> = {};
    let scored = 0;
    for (const r of rows) {
      if (r.eval_state === 1) scored += 1;
      if (r.user_opinion !== 2) counts[String(r.user_opinion)] = (counts[String(r.user_opinion)] || 0) + 1;
    }
    const members = (mapRows(db.exec(
      'SELECT COUNT(*) as c FROM committee_member_assignments WHERE committee_id = ? AND included = 1',
      [committee.id]
    ))[0]?.c as number) ?? 0;
    tally = { total: members, voted: scored, counts };
  }

  // Per-member vote detail — visible to the commander and deputy (EVAL1 / EVAL9), mirroring
  // the legacy EVAL_DOSNT / EVAL_LAGNA_RESULTS board (each member + their chosen option).
  let memberVotes: Record<string, any>[] | null = null;
  if (activeOfficer && isCommanderSeat(req.user!.username)) {
    const rows = mapRows(db.exec(
      `SELECT cma.user_id, cma.name_snapshot, cma.rank_snapshot, u.job_title, u.username,
              mv.user_opinion, mv.eval_state
       FROM committee_member_assignments cma
       JOIN users u ON u.id = cma.user_id
       LEFT JOIN member_votes mv ON mv.committee_id = cma.committee_id AND mv.user_id = cma.user_id
         AND mv.officer_id = ? AND mv.ta3n_type = ?
       WHERE cma.committee_id = ? AND cma.included = 1
       ORDER BY cma.serial`,
      [activeOfficer.officer_id, activeOfficer.ta3n_type ?? 0, committee.id]
    ));
    memberVotes = rows.map((r) => {
      // "finished" = saved scores (eval_state = 1); user_opinion is the commander's only.
      const done = r.eval_state === 1;
      const hasOpinion = r.user_opinion != null && r.user_opinion !== 2;
      return {
        name: r.job_title || [r.rank_snapshot, r.name_snapshot].filter(Boolean).join(' / ') || r.username,
        voted: done,
        user_opinion: hasOpinion ? r.user_opinion : null,
      };
    });
  }

  // For the زائر (guest) spectator: which included members still owe a vote on the active officer.
  // Name + a voted flag only — never the chosen option — so a spectator can't infer the running
  // result. The guest screen lists the pending ones and animates each away once it votes.
  let memberStatuses: Record<string, any>[] | null = null;
  if (activeOfficer && isGuest) {
    const rows = mapRows(db.exec(
      `SELECT cma.user_id, cma.serial, cma.name_snapshot, cma.rank_snapshot, u.job_title, u.username,
              mv.eval_state
       FROM committee_member_assignments cma
       JOIN users u ON u.id = cma.user_id
       LEFT JOIN member_votes mv ON mv.committee_id = cma.committee_id AND mv.user_id = cma.user_id
         AND mv.officer_id = ? AND mv.ta3n_type = ?
       WHERE cma.committee_id = ? AND cma.included = 1
       ORDER BY cma.serial`,
      [activeOfficer.officer_id, activeOfficer.ta3n_type ?? 0, committee.id]
    ));
    // serial is the committee's fixed member order (same as the admin committee page), so the
    // شاشة التصويت can render in that order regardless of who finished or was removed.
    memberStatuses = rows.map((r) => ({
      user_id: r.user_id,
      serial: r.serial,
      name: r.job_title || [r.rank_snapshot, r.name_snapshot].filter(Boolean).join(' / ') || r.username,
      voted: r.eval_state === 1,
    }));
  }

  // The logged-in member's own identity for the header: rank beside the name. The rank is
  // not in the JWT, so it is resolved here from the member's linked officer record.
  const viewer = mapRows(db.exec(
    `SELECT u.display_name, u.job_title, COALESCE(r.ran_n, u.rank_name) AS rank_name
     FROM users u
     LEFT JOIN officers o ON o.id = u.officer_id
     LEFT JOIN ranks r ON r.ran_c = o.rank_code
     WHERE u.id = ?`,
    [userId]
  ))[0] ?? null;

  res.json({ committee, activeOfficer, myVote, evalItems, progress: { total, voted }, tally, memberVotes, memberStatuses, viewer });
});

// GET /officer-cv/:officerId - officer CV summary (ملخص بيانات الضابط) sections.
router.get('/officer-cv/:officerId', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const officerId = Number(req.params.officerId);
  if (!Number.isInteger(officerId)) {
    res.status(400).json({ error: 'معرف الضابط غير صحيح' });
    return;
  }

  if (!assertOfficerAccess(db, req, officerId)) { res.status(403).json({ error: 'غير مصرح' }); return; }

  const header = mapRows(db.exec(
    `SELECT o.id, o.per_name, o.akdam_no, o.akdam_rep, o.full_rank as rank_name,
            o.unt_n as unit_name, o.job_n as job_name, o.speciality as spec_name
     FROM officers o
     WHERE o.id = ?`,
    [officerId]
  ))[0] ?? null;

  const basic = mapRows(db.exec(
    `SELECT weight, height, fark_wazn, marital_status, wife_status, boy_no, girl_no,
            mil_qualification as main_qualify_spec, civil_qualification as civil_qualify,
            in_service, faculty, off_notice, taraky_estifa, estifa_job, entedab
     FROM officers WHERE id = ?`,
    [officerId]
  ))[0] ?? {};
  // زيادة الوزن + الاستيفاء: imported verbatim now (FARK_WAZN, TARAKY_ESTIFA, ESTIFA_JOB) —
  // no computed tanasok / no استيفاء engine.
  basic.tanasok = basic.fark_wazn != null
    ? basic.fark_wazn
    : (basic.weight != null && basic.height != null ? basic.weight + 100 - basic.height : null);

  // الوظائف السابقة: every column is imported verbatim (rank, unit, job, المرتب rank,
  // promotion-qualification text, from/to dates, years, months) — no joins, no derived period.
  const jobs = mapRows(db.exec(
    `SELECT ran_n, unt_n, job_n, ran_n_mrtb, wasfia_tuahel_trky, from_date, to_date, year, month, marked_color
     FROM officer_holder_wazayef
     WHERE officer_id = ? ORDER BY from_date DESC`,
    [officerId]
  ));
  // تقارير الكفاءة imported verbatim (SECURITYS): KAED = القائد المباشر, MOSDAK = المصدق,
  // FROM_DATE_C/TO_DATE = فترة التقرير (MM-YYYY), GRADE_COM = التقدير. Aliased to the existing
  // payload keys so the CV table barely changes. Ordered by the ISO from_date.
  const kafaa = mapRows(db.exec(
    `SELECT from_date_c, to_date, kaed AS commander_rating, mosdak AS approver_rating, grade_com
     FROM officer_kafaa WHERE officer_id = ? ORDER BY from_date DESC`,
    [officerId]
  ));
  // المتوسط (legacy KAFAA_AVERAGE): round(avg of the commander ratings) mapped to a grades
  // band, e.g. "جيد جدا (٨٥)". per/grade are null when the officer has no rated reports.
  const avgPerRaw = mapRows(db.exec(
    'SELECT ROUND(AVG(kaed)) AS per FROM officer_kafaa WHERE officer_id = ? AND kaed IS NOT NULL',
    [officerId]
  ))[0]?.per;
  const avgPer = avgPerRaw != null ? Number(avgPerRaw) : null;
  const kafaa_avg = {
    per: avgPer,
    grade: avgPer != null
      ? (mapRows(db.exec(
          'SELECT grade_name FROM grades WHERE ? >= from_range AND ? <= to_range LIMIT 1',
          [avgPer, avgPer]
        ))[0]?.grade_name as string) ?? null
      : null,
  };
  const paasat = mapRows(db.exec(
    'SELECT activ_name, activ_note, country_name, date_from, date_to FROM officer_holder_paasat WHERE officer_id = ? ORDER BY date_from DESC',
    [officerId]
  ));
  // الدراسات العلمية (TAHIL_3LMY) والتأهيل العسكري (TAHIL_3ASKARY): denormalized text, shown
  // verbatim in the الدراسات العلمية / التأهيل tab.
  const tahil_3lmy = mapRows(db.exec(
    'SELECT subject, type, mawkaf FROM officer_tahil_3lmy WHERE officer_id = ? ORDER BY id',
    [officerId]
  ));
  const tahil_3askary = mapRows(db.exec(
    'SELECT job_n FROM officer_tahil_3askary WHERE officer_id = ? ORDER BY id',
    [officerId]
  ));
  // المحاكمات/الجزاءات: merged into one table, each row a full verbatim statement.
  const punishments = mapRows(db.exec(
    'SELECT gaza FROM officer_punishments_geza WHERE officer_id = ? ORDER BY id',
    [officerId]
  ));
  const health = mapRows(db.exec(
    'SELECT se7a FROM officer_holder_health WHERE officer_id = ? ORDER BY id',
    [officerId]
  ));
  // الأبناء (persistent, system-managed — survives the quarterly officers wipe). Ordered
  // eldest-first by birth date; rows without a date sort first.
  const children = mapRows(db.exec(
    'SELECT name, gender, date_birth, notes FROM officer_children WHERE officer_id = ? ORDER BY date_birth, id',
    [officerId]
  ));

  // The البيانات الأساسية tab hides the tagdded-only استيفاء fields for edarya committees, so
  // the member view needs to know which committee it is read under (the active one).
  const committee_type = (mapRows(db.exec(
    'SELECT committee_type FROM committees WHERE is_active = 1 LIMIT 1'
  ))[0]?.committee_type as string) ?? null;

  res.json({ header, basic, jobs, kafaa, kafaa_avg, paasat, tahil_3lmy, tahil_3askary, punishments, health, children, committee_type });
});

// GET /officer-joblevel/:officerId - المستويات الوظيفية reference (commander screen):
// the kin_c=2 job-level ladder + the officer's current level (from mrtb.level_c_daleel).
router.get('/officer-joblevel/:officerId', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const officerId = Number(req.params.officerId);
  if (!Number.isInteger(officerId)) { res.status(400).json({ error: 'معرف الضابط غير صحيح' }); return; }
  if (!assertOfficerAccess(db, req, officerId)) { res.status(403).json({ error: 'غير مصرح' }); return; }

  const cur = mapRows(db.exec(
    'SELECT m.level_c_daleel FROM officers o JOIN mrtb m ON m.job_c = o.job_code WHERE o.id = ?',
    [officerId]
  ))[0];
  const currentLevel = cur?.level_c_daleel != null ? Number(cur.level_c_daleel) : null;
  const levels = mapRows(db.exec(
    'SELECT level_c, level_n, promotes_to, category FROM joblevel_promotion WHERE promotes_kin_c = 2 AND level_n IS NOT NULL ORDER BY level_c'
  ));
  res.json({ currentLevel, levels });
});

// GET /officer-share7a/:officerId - ضباط الشريحة: peer officers in the same bulletin slice
// (same nashra_rank/type/tagdeed + kind), with their career total + استيفاء, ranked by total.
router.get('/officer-share7a/:officerId', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const officerId = Number(req.params.officerId);
  if (!Number.isInteger(officerId)) { res.status(400).json({ error: 'معرف الضابط غير صحيح' }); return; }
  if (!assertOfficerAccess(db, req, officerId)) { res.status(403).json({ error: 'غير مصرح' }); return; }

  const committee = mapRows(db.exec(
    `SELECT c.id, c.nashra_date FROM committees c
     JOIN committee_officers co ON co.committee_id = c.id
     WHERE c.is_active = 1 AND co.officer_id = ? LIMIT 1`,
    [officerId]
  ))[0];
  const nashraDate = committee?.nashra_date ?? null;
  const slice = nashraDate ? mapRows(db.exec(
    `SELECT nin.nashra_rank, nin.nashra_type, nin.nashra_tagdeed, o.kind_code
     FROM officers_in_nashra nin JOIN officers o ON o.id = nin.officer_id
     WHERE nin.officer_id = ? AND nin.nashra_date = ? LIMIT 1`,
    [officerId, nashraDate]
  ))[0] : null;
  if (!slice) { res.json({ peers: [] }); return; }

  const peers = mapRows(db.exec(
    `SELECT o.id, o.per_name, o.akdam_no, o.akdam_rep, o.full_rank as rank_name,
            o.taraky_estifa, t.total
     FROM officers_in_nashra nin
     JOIN officers o ON o.id = nin.officer_id
     LEFT JOIN takyeem_scores t ON t.officer_id = o.id AND t.nashra_date = nin.nashra_date
     WHERE nin.nashra_date = ? AND nin.nashra_rank = ? AND nin.nashra_type = ?
       AND nin.nashra_tagdeed = ? AND o.kind_code = ?
     ORDER BY COALESCE(t.total, 0) DESC`,
    [nashraDate, slice.nashra_rank, slice.nashra_type, slice.nashra_tagdeed, slice.kind_code]
  )).map((p, i) => ({
    officer_id: p.id,
    order: i + 1,
    rank_name: p.rank_name,
    per_name: p.per_name,
    akdam: [p.akdam_no != null ? p.akdam_no : '', p.akdam_rep || ''].filter(String).join(' '),
    total: p.total ?? 0,
    estifa: p.taraky_estifa ? (String(p.taraky_estifa).includes('غير مستوف') ? 0 : 1) : null,
    is_current: p.id === officerId,
  }));
  res.json({ peers });
});

// GET /officer-service/:officerId - نتيجة تقييم مسير الخدمة: the seven component maxes + the
// officer's saved degrees + total + % (المرحلة ٢). Reference page on the voting card; guarded so a
// member may only open an officer in their active committee.
router.get('/officer-service/:officerId', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const officerId = Number(req.params.officerId);
  if (!Number.isInteger(officerId)) { res.status(400).json({ error: 'معرف الضابط غير صحيح' }); return; }
  if (!assertOfficerAccess(db, req, officerId)) { res.status(403).json({ error: 'غير مصرح' }); return; }
  res.json({ basis: getBasis(), total_max: totalMax(), score: getServiceScore(officerId) });
});

// GET /committee/:committeeId/status - per-officer voting progress (admin/monitor).
router.get('/committee/:committeeId/status', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.committeeId);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const total = (mapRows(db.exec(
    'SELECT COUNT(*) as c FROM committee_member_assignments WHERE committee_id = ? AND included = 1',
    [committeeId]
  ))[0]?.c as number) ?? 0;

  const officers = mapRows(db.exec(
    `SELECT officer_id, serial, officer_name, rank_name, done, is_active, ta3n_type
     FROM committee_officers WHERE committee_id = ? AND hidden = 0 ORDER BY serial`,
    [committeeId]
  ));

  const votes = mapRows(db.exec(
    `SELECT mv.officer_id, mv.ta3n_type, mv.user_opinion
     FROM member_votes mv
     JOIN committee_member_assignments cma
       ON cma.committee_id = mv.committee_id AND cma.user_id = mv.user_id
     WHERE mv.committee_id = ? AND cma.included = 1`,
    [committeeId]
  ));

  // Counts are scoped per (officer, ta3n_type) so edarya officers registered under multiple
  // case types don't collide, and per-option counts drive the per-type breakdown display.
  const status = officers.map((o: any) => {
    const ta3n = o.ta3n_type ?? 0;
    const ov = votes.filter((v: any) =>
      v.officer_id === o.officer_id && (v.ta3n_type ?? 0) === ta3n && v.user_opinion !== 2);
    const counts: Record<string, number> = {};
    for (const v of ov) counts[String(v.user_opinion)] = (counts[String(v.user_opinion)] || 0) + 1;
    return {
      ...o,
      total,
      voted: ov.length,
      counts,
      for: counts['1'] || 0,
      against: counts['0'] || 0,
    };
  });

  res.json(status);
});

// GET /committee/:committeeId/officer/:officerId/scores - admin read-only score matrix
// (موقف تقييم الأعضاء): every included member's بند scores for one officer. The computed بنود
// (مسير الخدمة % + لغة إنجليزية) are the same for all members; each member gets a total + نسبة,
// plus per-بند averages and the overall average of the members who finished.
router.get('/committee/:committeeId/officer/:officerId/scores', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.committeeId);
  const officerId = Number(req.params.officerId);
  if (!Number.isInteger(committeeId) || !Number.isInteger(officerId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }

  const officer = mapRows(db.exec(
    `SELECT officer_id, serial, officer_name, rank_name, akdam_no, akdam_rep, target_job,
            done, final_eval, kaed_tawsya, l_lagna_type_c
     FROM committee_officers WHERE committee_id = ? AND officer_id = ?`,
    [committeeId, officerId]
  ))[0];
  if (!officer) { res.status(404).json({ error: 'الضابط غير موجود في اللجنة' }); return; }

  const ss = getServiceScore(officerId);
  const servicePct = (ss?.pct ?? null) as number | null;
  const english = (ss?.english ?? null) as number | null;

  const items = mapRows(db.exec(
    'SELECT id, serial, name, max_degree, kind, source FROM committee_eval_items WHERE committee_id = ? ORDER BY serial, id',
    [committeeId]
  ));
  const totalMaxItems = items.reduce((s: number, it: any) => s + (Number(it.max_degree) || 0), 0);

  const members = mapRows(db.exec(
    `SELECT user_id, serial, name_snapshot AS name, rank_snapshot AS rank_name
     FROM committee_member_assignments WHERE committee_id = ? AND included = 1 ORDER BY serial`,
    [committeeId]
  ));

  const scoreMap = new Map<string, number>();
  for (const r of mapRows(db.exec(
    'SELECT user_id, item_id, score FROM member_item_scores WHERE committee_id = ? AND officer_id = ?',
    [committeeId, officerId]
  ))) if (r.score != null) scoreMap.set(`${r.user_id}:${r.item_id}`, Number(r.score));

  const votedSet = new Set<number>(mapRows(db.exec(
    'SELECT user_id FROM member_votes WHERE committee_id = ? AND officer_id = ? AND eval_state = 1',
    [committeeId, officerId]
  )).map((v: any) => Number(v.user_id)));

  const computedVal = (it: any): number | null =>
    it.kind === 'computed' ? (it.source === 'english' ? english : servicePct) : null;

  const memberRows = members.map((m: any) => {
    const scores: Record<number, number | null> = {};
    let total = 0;
    for (const it of items) {
      const v = it.kind === 'computed'
        ? computedVal(it)
        : (scoreMap.has(`${m.user_id}:${it.id}`) ? scoreMap.get(`${m.user_id}:${it.id}`)! : null);
      scores[it.id] = v;
      total += Number(v) || 0;
    }
    const pct = totalMaxItems > 0 ? Math.round((total / totalMaxItems) * 1000) / 10 : 0;
    return {
      user_id: m.user_id, serial: m.serial, name: m.name, rank_name: m.rank_name,
      voted: votedSet.has(Number(m.user_id)), scores, total, pct,
    };
  });

  const itemAvg: Record<number, number | null> = {};
  for (const it of items) {
    if (it.kind === 'computed') { itemAvg[it.id] = computedVal(it); continue; }
    const vals = memberRows.map((m: any) => m.scores[it.id]).filter((x: any): x is number => x != null);
    itemAvg[it.id] = vals.length
      ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
  }
  const votedRows = memberRows.filter((m: any) => m.voted);
  const avgTotal = votedRows.length
    ? Math.round((votedRows.reduce((a: number, m: any) => a + m.total, 0) / votedRows.length) * 10) / 10 : null;
  const overallPct = votedRows.length
    ? Math.round((votedRows.reduce((a: number, m: any) => a + m.pct, 0) / votedRows.length) * 10) / 10 : null;

  res.json({
    officer: {
      ...officer,
      service_score_pct: servicePct,
      english_score: english,
      decision: tamseelDecision(officer.final_eval),
    },
    items,
    total_max: totalMaxItems,
    members: memberRows,
    averages: { items: itemAvg, total: avgTotal, overall_pct: overallPct },
  });
});

// PUT /committee/:committeeId/officer/:officerId/review - admin review (مراجعة تقييم أعضاء اللجنة):
// override members' manual بند scores, and set the officer's final evaluation + توصية القائد بالإحالة.
// Computed بنود (مسير الخدمة / لغة إنجليزية) are never written here. Any member the admin scores is
// marked eval_state=1 so it counts in the averages.
router.put('/committee/:committeeId/officer/:officerId/review', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.committeeId);
  const officerId = Number(req.params.officerId);
  if (!Number.isInteger(committeeId) || !Number.isInteger(officerId)) {
    res.status(400).json({ error: 'معرف غير صحيح' });
    return;
  }
  const officer = mapRows(db.exec(
    'SELECT officer_id FROM committee_officers WHERE committee_id = ? AND officer_id = ?',
    [committeeId, officerId]
  ))[0];
  if (!officer) { res.status(404).json({ error: 'الضابط غير موجود في اللجنة' }); return; }

  const body = req.body ?? {};

  const items = mapRows(db.exec(
    'SELECT id, max_degree, kind FROM committee_eval_items WHERE committee_id = ?',
    [committeeId]
  ));
  const itemById = new Map<number, any>(items.map((it: any) => [Number(it.id), it]));

  const scores = Array.isArray(body.scores) ? body.scores : [];
  const touchedMembers = new Set<number>();
  for (const s of scores) {
    const userId = Number(s?.user_id);
    const itemId = Number(s?.item_id);
    const item = itemById.get(itemId);
    if (!Number.isInteger(userId) || !item || item.kind === 'computed') continue;
    let val = s?.score === null || s?.score === '' || s?.score === undefined ? null : Number(s.score);
    if (val != null) {
      if (!Number.isFinite(val)) continue;
      val = Math.max(0, Math.min(val, Number(item.max_degree)));
    }
    db.run(
      `INSERT INTO member_item_scores (committee_id, user_id, officer_id, item_id, score, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(committee_id, user_id, officer_id, item_id)
       DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`,
      [committeeId, userId, officerId, itemId, val]
    );
    if (val != null) touchedMembers.add(userId);
  }

  // A member the admin has scored is now "evaluated" so it counts in the averages/final.
  for (const userId of touchedMembers) {
    db.run(
      `INSERT INTO member_votes (committee_id, user_id, officer_id, ta3n_type, eval_state, user_opinion, voted_at)
       VALUES (?, ?, ?, 0, 1, 2, datetime('now'))
       ON CONFLICT(committee_id, user_id, officer_id, ta3n_type)
       DO UPDATE SET eval_state = 1, voted_at = excluded.voted_at`,
      [committeeId, userId, officerId]
    );
  }

  // التقييم النهائي (تصدق=1 / لا يتصدق=2 / يؤجل=-1) — admin override marks eval_type=2.
  if ('final_eval' in body) {
    const fe = body.final_eval;
    if (fe === null || fe === '') {
      db.run('UPDATE committee_officers SET final_eval = NULL WHERE committee_id = ? AND officer_id = ?', [committeeId, officerId]);
    } else if (['1', '2', '-1'].includes(String(Number(fe)))) {
      db.run('UPDATE committee_officers SET final_eval = ?, eval_type = 2 WHERE committee_id = ? AND officer_id = ?',
        [String(Number(fe)), committeeId, officerId]);
    }
  }

  // توصية القائد بالإحالة (0 = يوصى, 1 = لا يوصى, null = بدون).
  if ('kaed_tawsya' in body) {
    const kt = body.kaed_tawsya;
    const norm = kt === null || kt === '' ? null : Number(kt);
    db.run('UPDATE committee_officers SET kaed_tawsya = ? WHERE committee_id = ? AND officer_id = ?',
      [norm, committeeId, officerId]);
  }

  saveDB();
  res.json({ message: 'تم حفظ المراجعة' });
});

// POST /vote - cast/update the member's vote for an officer in the active committee.
router.post('/vote', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const userId = req.user!.id;
  const officerId = Number(req.body?.officer_id);
  const userOpinion = Number(req.body?.user_opinion);

  if (!Number.isInteger(officerId) || !Number.isInteger(userOpinion)) {
    res.status(400).json({ error: 'بيانات التصويت غير صحيحة' });
    return;
  }

  // A guest never holds an assignment, so the lookup below would reject it anyway; this
  // says why instead of blaming a missing committee.
  if (isGuestUser(db, req)) {
    res.status(403).json({ error: 'التصويت غير متاح للزائر' });
    return;
  }

  // التمثيل العسكري: the تصدق / لا يتصدق decision belongs to the commander and his deputy only;
  // regular members only enter بند scores via POST /scores.
  if (!isCommanderSeat(req.user!.username)) {
    res.status(403).json({ error: 'القرار (تصدق / لا يتصدق) متاح للقائد ونائبه فقط' });
    return;
  }

  const committee = mapRows(db.exec(
    `SELECT c.id, c.committee_type, c.tamhidy
     FROM committees c
     JOIN committee_member_assignments cma ON cma.committee_id = c.id
     WHERE c.is_active = 1 AND cma.user_id = ? AND cma.included = 1
     LIMIT 1`,
    [userId]
  ))[0];
  if (!committee) {
    res.status(403).json({ error: 'لا توجد لجنة نشطة متاحة لك' });
    return;
  }

  // Single committee type shares one voting item per officer (ta3n_type 0).
  const voteTa3n = 0;

  // التمثيل decision: تصدق (1) / لا يتصدق (0).
  const allowed = [0, 1];
  if (!allowed.includes(userOpinion)) {
    res.status(400).json({ error: 'بيانات القرار غير صحيحة' });
    return;
  }

  const officer = mapRows(db.exec(
    'SELECT officer_id, done FROM committee_officers WHERE committee_id = ? AND officer_id = ? AND hidden = 0',
    [committee.id, officerId]
  ))[0];
  if (!officer) {
    res.status(404).json({ error: 'الضابط غير موجود في اللجنة' });
    return;
  }
  if (officer.done === 1) {
    res.status(400).json({ error: 'تم إغلاق التصويت على هذا الضابط' });
    return;
  }

  // The commander's decision marks his row finished (eval_state = 1) and carries the opinion.
  const evalState = 1;

  db.run(
    `INSERT INTO member_votes
       (committee_id, user_id, officer_id, ta3n_type, eval_state, user_opinion, voted_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(committee_id, user_id, officer_id, ta3n_type)
     DO UPDATE SET eval_state = excluded.eval_state, user_opinion = excluded.user_opinion,
                   voted_at = excluded.voted_at`,
    [committee.id, userId, officerId, voteTa3n, evalState, userOpinion]
  );

  // Commander/deputy (EVAL1<->EVAL9) votes mirror to each other.
  const dep = deputyOf(req.user!.username);
  if (dep) {
    const depUser = mapRows(db.exec(
      `SELECT u.id FROM users u
       JOIN committee_member_assignments cma ON cma.user_id = u.id
       WHERE u.username = ? AND cma.committee_id = ? AND cma.included = 1`,
      [dep, committee.id]
    ))[0];
    if (depUser) {
      db.run(
        `INSERT INTO member_votes
           (committee_id, user_id, officer_id, ta3n_type, eval_state, user_opinion, voted_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(committee_id, user_id, officer_id, ta3n_type)
         DO UPDATE SET eval_state = excluded.eval_state, user_opinion = excluded.user_opinion,
                       voted_at = excluded.voted_at`,
        [committee.id, depUser.id, officerId, voteTa3n, evalState, userOpinion]
      );
    }
  }

  // التمثيل: the commander's decision IS the officer's final decision (تصدق = 1 / لا يتصدق = 2).
  db.run(
    'UPDATE committee_officers SET final_eval = ?, eval_type = 2 WHERE committee_id = ? AND officer_id = ?',
    [userOpinion === 1 ? '1' : '2', committee.id, officerId]
  );
  saveDB();

  res.json({ message: 'تم تسجيل القرار', user_opinion: userOpinion, eval_state: evalState });
});

// POST /scores - a member saves their بند scores for the active officer (التمثيل العسكري).
// Every included member (commander too) scores the manual بنود; مسير الخدمة is computed and never
// sent here. Saving marks the member's row finished (eval_state = 1); user_opinion stays 2 for a
// regular member (only the commander's POST /vote sets تصدق/لا يتصدق).
router.post('/scores', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const userId = req.user!.id;
  const officerId = Number(req.body?.officer_id);
  const scores = Array.isArray(req.body?.scores) ? req.body.scores : null;
  if (!Number.isInteger(officerId) || !scores) {
    res.status(400).json({ error: 'بيانات التقييم غير صحيحة' });
    return;
  }
  if (isGuestUser(db, req)) {
    res.status(403).json({ error: 'التقييم غير متاح للزائر' });
    return;
  }

  const committee = mapRows(db.exec(
    `SELECT c.id FROM committees c
     JOIN committee_member_assignments cma ON cma.committee_id = c.id
     WHERE c.is_active = 1 AND cma.user_id = ? AND cma.included = 1
     LIMIT 1`,
    [userId]
  ))[0];
  if (!committee) {
    res.status(403).json({ error: 'لا توجد لجنة نشطة متاحة لك' });
    return;
  }

  const officer = mapRows(db.exec(
    'SELECT officer_id, done FROM committee_officers WHERE committee_id = ? AND officer_id = ? AND hidden = 0',
    [committee.id, officerId]
  ))[0];
  if (!officer) {
    res.status(404).json({ error: 'الضابط غير موجود في اللجنة' });
    return;
  }
  if (officer.done === 1) {
    res.status(400).json({ error: 'تم إغلاق التقييم على هذا الضابط' });
    return;
  }

  // Only THIS committee's manual بنود are settable; مسير الخدمة (computed) is ignored, and each
  // score is clamped to 0..max_degree.
  const items = mapRows(db.exec(
    'SELECT id, max_degree, kind FROM committee_eval_items WHERE committee_id = ?',
    [committee.id]
  ));
  const byId = new Map<number, any>(items.map((it: any) => [Number(it.id), it]));

  for (const s of scores) {
    const itemId = Number(s?.item_id);
    const item = byId.get(itemId);
    if (!item || item.kind === 'computed') continue;
    let val = s?.score === null || s?.score === '' || s?.score === undefined ? null : Number(s.score);
    if (val != null) {
      if (!Number.isFinite(val)) continue;
      val = Math.max(0, Math.min(val, Number(item.max_degree)));
    }
    db.run(
      `INSERT INTO member_item_scores (committee_id, user_id, officer_id, item_id, score, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(committee_id, user_id, officer_id, item_id)
       DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`,
      [committee.id, userId, officerId, itemId, val]
    );
  }

  // Mark this member's evaluation finished. Keep any existing user_opinion (the commander may
  // have already decided); a regular member's stays 2.
  db.run(
    `INSERT INTO member_votes (committee_id, user_id, officer_id, ta3n_type, eval_state, user_opinion, voted_at)
     VALUES (?, ?, ?, 0, 1, 2, datetime('now'))
     ON CONFLICT(committee_id, user_id, officer_id, ta3n_type)
     DO UPDATE SET eval_state = 1, voted_at = excluded.voted_at`,
    [committee.id, userId, officerId]
  );

  saveDB();
  res.json({ message: 'تم حفظ التقييم' });
});

// POST /advance - commander/deputy (EVAL1/EVAL9) moves the active officer next/prev.
router.post('/advance', (req: AuthRequest, res: Response) => {
  const db = getDB();
  const userId = req.user!.id;
  const direction = req.body?.direction;
  if (direction !== 'next' && direction !== 'prev') {
    res.status(400).json({ error: 'اتجاه غير صحيح' });
    return;
  }
  if (!isCommanderSeat(req.user!.username)) {
    res.status(403).json({ error: 'غير مصرح - متاح للقائد ونائبه فقط' });
    return;
  }

  const committee = mapRows(db.exec(
    `SELECT c.id FROM committees c
     JOIN committee_member_assignments cma ON cma.committee_id = c.id
     WHERE c.is_active = 1 AND cma.user_id = ? AND cma.included = 1
     LIMIT 1`,
    [userId]
  ))[0];
  if (!committee) {
    res.status(403).json({ error: 'لا توجد لجنة نشطة متاحة لك' });
    return;
  }

  const current = mapRows(db.exec(
    'SELECT id, serial FROM committee_officers WHERE committee_id = ? AND is_active = 1 LIMIT 1',
    [committee.id]
  ))[0];
  const curSerial = current ? (current.serial as number) : direction === 'next' ? -1 : Number.MAX_SAFE_INTEGER;

  // Legacy التالي gate: the commander must have cast his own vote first, and all included
  // members must have finished the current officer, before advancing to the next one.
  if (direction === 'next' && current) {
    const active = mapRows(db.exec(
      'SELECT officer_id, ta3n_type FROM committee_officers WHERE id = ?',
      [current.id]
    ))[0];
    if (active) {
      const officerId = active.officer_id as number;
      const ta3n = active.ta3n_type != null ? Number(active.ta3n_type) : 0;
      const iAmIncluded = mapRows(db.exec(
        'SELECT 1 FROM committee_member_assignments WHERE committee_id = ? AND user_id = ? AND included = 1',
        [committee.id, userId]
      )).length > 0;
      const iVoted = mapRows(db.exec(
        'SELECT 1 FROM member_votes WHERE committee_id = ? AND user_id = ? AND officer_id = ? AND ta3n_type = ? AND user_opinion <> 2',
        [committee.id, userId, officerId, ta3n]
      )).length > 0;
      if (iAmIncluded && !iVoted) {
        res.status(400).json({ error: 'برجاء اتخاذ القرار (تصدق / لا يتصدق) أولاً' });
        return;
      }
      const total = (mapRows(db.exec(
        'SELECT COUNT(*) c FROM committee_member_assignments WHERE committee_id = ? AND included = 1',
        [committee.id]
      ))[0]?.c as number) ?? 0;
      // All included members must have FINISHED their scores (eval_state = 1) before advancing.
      const voted = (mapRows(db.exec(
        `SELECT COUNT(DISTINCT mv.user_id) c FROM member_votes mv
         JOIN committee_member_assignments cma ON cma.committee_id = mv.committee_id AND cma.user_id = mv.user_id
         WHERE mv.committee_id = ? AND mv.officer_id = ? AND mv.ta3n_type = ? AND mv.eval_state = 1 AND cma.included = 1`,
        [committee.id, officerId, ta3n]
      ))[0]?.c as number) ?? 0;
      if (voted < total) {
        res.status(400).json({ error: 'برجاء الإنتظار لحين إنتهاء جميع الأعضاء من التقييم' });
        return;
      }
    }
  }

  let target: Record<string, any> | undefined;
  if (direction === 'next') {
    target = mapRows(db.exec(
      'SELECT id FROM committee_officers WHERE committee_id = ? AND hidden = 0 AND done = 0 AND serial > ? ORDER BY serial LIMIT 1',
      [committee.id, curSerial]
    ))[0];
  } else {
    target = mapRows(db.exec(
      'SELECT id FROM committee_officers WHERE committee_id = ? AND hidden = 0 AND serial < ? ORDER BY serial DESC LIMIT 1',
      [committee.id, curSerial]
    ))[0];
  }

  if (direction === 'prev') {
    // Prev goes back to the previous officer and RE-OPENS it (clears done) so it becomes
    // the live active officer again. There is nothing before the first officer.
    if (!target) {
      res.status(400).json({ error: 'لا يوجد ضابط سابق' });
      return;
    }
    db.run('UPDATE committee_officers SET is_active = 0 WHERE committee_id = ?', [committee.id]);
    db.run('UPDATE committee_officers SET is_active = 1, done = 0 WHERE id = ?', [target.id]);
    saveDB();
    res.json({ message: 'تم التحديث', id: target.id, finished: false });
    return;
  }

  // direction === 'next': finalize the current officer (mark done). If a next officer
  // exists, activate it; otherwise this was the last officer -> finish (keep it active,
  // now closed, so the screen doesn't blank).
  if (current) db.run('UPDATE committee_officers SET done = 1 WHERE id = ?', [current.id]);
  if (target) {
    db.run('UPDATE committee_officers SET is_active = 0 WHERE committee_id = ?', [committee.id]);
    db.run('UPDATE committee_officers SET is_active = 1 WHERE id = ?', [target.id]);
    saveDB();
    res.json({ message: 'تم التحديث', id: target.id, finished: false });
  } else {
    // Last officer finished -> close the whole committee (snapshot + auto-احتساب + complete +
    // deactivate), mirroring the admin "إنهاء اللجنة" action. Auto-finalize stores any officer's
    // decision that was never computed, so the chain hint and reports always have it (no-op for edarya).
    backupCommittee(committee.id);
    finalizeTagddedDecisions(committee.id, true);
    db.run("UPDATE committees SET status = 'completed', is_active = 0 WHERE id = ?", [committee.id]);
    saveDB();
    res.json({ message: 'تم إنهاء اللجنة', id: current?.id ?? null, finished: true });
  }
});

// POST /committee/:committeeId/calculate - finalize tagdded decisions: set each officer's
// final_eval from the majority of cast member opinions.
router.post('/committee/:committeeId/calculate', requireAdmin, (req: AuthRequest, res: Response) => {
  const db = getDB();
  const committeeId = Number(req.params.committeeId);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }

  const committee = mapRows(db.exec(
    'SELECT id, committee_type FROM committees WHERE id = ?',
    [committeeId]
  ))[0];
  if (!committee) {
    res.status(404).json({ error: 'اللجنة غير موجودة' });
    return;
  }
  if (committee.committee_type !== 'tagdded') {
    res.status(400).json({ error: 'الاحتساب متاح للجان التجديد والترقي فقط حالياً' });
    return;
  }

  // Snapshot before overwriting, then recompute every officer (onlyUnset=false) — the explicit
  // admin recalculation overrides any previously stored decisions.
  backupCommittee(committeeId);
  const results = finalizeTagddedDecisions(committeeId, false);
  saveDB();
  res.json({ officers: results, message: `تم احتساب نتائج ${results.length} ضابط` });
});

// GET /committee/:committeeId/disputes - officers manually flagged خلاف (dispute = 1).
router.get('/committee/:committeeId/disputes', requireAdmin, (req: AuthRequest, res: Response) => {
  const committeeId = Number(req.params.committeeId);
  if (!Number.isInteger(committeeId)) {
    res.status(400).json({ error: 'معرف اللجنة غير صحيح' });
    return;
  }
  res.json(detectDisputes(committeeId));
});

export default router;
