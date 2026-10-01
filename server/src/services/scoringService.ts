import { getDB } from '../db/connection.js';
import { tamseelDecision } from '../config/decision.js';

function mapRows(results: any[]): Record<string, any>[] {
  if (!results.length || !results[0].values.length) return [];
  const cols: string[] = results[0].columns;
  return results[0].values.map((row: any[]) => {
    const obj: Record<string, any> = {};
    cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
    return obj;
  });
}

// Committee decision by opinion majority (ties favor the officer -> تصدق), matching the legacy
// CALCULATE_SUMMARY. decision_code 0 = not decided (no votes), 1 = تصدق, 2 = لا يتصدق.
export function calculateTagddedDecision(
  committeeId: number,
  officerId: number,
  _lagnaTypeC: number | null
): {
  accept: number;
  reject: number;
  postpone: number;
  decision: string;
  decision_code: number;
} {
  const db = getDB();
  const rows = mapRows(db.exec(
    `SELECT mv.user_opinion
     FROM member_votes mv
     JOIN committee_member_assignments cma
       ON cma.committee_id = mv.committee_id AND cma.user_id = mv.user_id
     WHERE mv.committee_id = ? AND mv.officer_id = ? AND cma.included = 1 AND mv.user_opinion <> 2`,
    [committeeId, officerId]
  ));

  const accept = rows.filter((r: any) => r.user_opinion === 1).length;
  const reject = rows.filter((r: any) => r.user_opinion === 0).length;
  // A legacy postpone (-1) wins only as the strict plurality; otherwise the تصدق/لا يتصدق
  // majority decides (a tie favors the officer -> تصدق).
  const postponeCount = rows.filter((r: any) => r.user_opinion === -1).length;
  const decision_code = rows.length === 0
    ? 0
    : postponeCount > accept && postponeCount > reject
      ? -1
      : accept >= reject ? 1 : 2;
  const decision = decision_code === 0 ? '' : tamseelDecision(decision_code);

  return { accept, reject, postpone: postponeCount, decision, decision_code };
}

// احتساب النتائج (finalize tagdded decisions): store each officer's final_eval from the
// majority of cast member opinions. Shared by POST /calculate and the auto-finalize on
// committee completion, so a finished committee always has stored decisions (the chain hint
// and reports read final_eval). onlyUnset=true fills gaps only (skips officers already
// decided), preserving manual احتساب / عكس القرار. No-op for non-tagdded. Caller handles saveDB.
export function finalizeTagddedDecisions(
  committeeId: number,
  onlyUnset = false
): Array<{ officer_id: number; decision_code: number; decision: string; accept: number; reject: number; postpone: number }> {
  const db = getDB();
  const committee = mapRows(db.exec(
    'SELECT committee_type FROM committees WHERE id = ?',
    [committeeId]
  ))[0];
  if (!committee || committee.committee_type !== 'tagdded') return [];

  const officers = mapRows(db.exec(
    'SELECT officer_id, l_lagna_type_c, final_eval FROM committee_officers WHERE committee_id = ? AND hidden = 0',
    [committeeId]
  ));

  const results: Array<{ officer_id: number; decision_code: number; decision: string; accept: number; reject: number; postpone: number }> = [];
  for (const o of officers) {
    const alreadySet = [1, 2, -1, '1', '2', '-1'].includes(o.final_eval as any);
    if (onlyUnset && alreadySet) continue;

    const dec = calculateTagddedDecision(
      committeeId, o.officer_id as number, o.l_lagna_type_c != null ? Number(o.l_lagna_type_c) : null
    );
    if (dec.decision_code !== 0) {
      db.run(
        'UPDATE committee_officers SET final_eval = ?, eval_type = 2 WHERE committee_id = ? AND officer_id = ?',
        [String(dec.decision_code), committeeId, o.officer_id]
      );
    }
    results.push({ officer_id: o.officer_id as number, ...dec });
  }
  return results;
}

// Startup self-heal: tagdded committees completed before auto-احتساب existed may have
// officers with no stored final_eval. Fill those gaps (onlyUnset) so the chain hint and
// reports always have a decision. Idempotent and non-destructive. Returns what it touched.
export function backfillCompletedTagddedDecisions(): { committees: number; officers: number } {
  const db = getDB();
  const list = mapRows(db.exec(
    "SELECT id FROM committees WHERE committee_type = 'tagdded' AND status = 'completed'"
  ));
  let committees = 0, officers = 0;
  for (const c of list) {
    const res = finalizeTagddedDecisions(c.id as number, true);
    if (res.length) { committees += 1; officers += res.length; }
  }
  return { committees, officers };
}
