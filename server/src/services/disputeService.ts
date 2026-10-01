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

export interface DisputeInfo {
  officer_id: number;
  serial: number | null;
  officer_name: string | null;
  rank_name: string | null;
  l_lagna_type_c: number | null;
  final_eval: string | null;
  decision: string;
  done: number;
}

// Faithful to legacy EVAL_KHLAF_OFF: disputes are officers manually flagged (dispute = 1)
// by the director (EVAL3) in the review screen; there is no vote-comparison auto-detection.
export function detectDisputes(committeeId: number): DisputeInfo[] {
  const db = getDB();
  const rows = mapRows(db.exec(
    `SELECT officer_id, serial, officer_name, rank_name, l_lagna_type_c, final_eval, done
     FROM committee_officers
     WHERE committee_id = ? AND dispute = 1 AND hidden = 0
     ORDER BY serial`,
    [committeeId]
  ));
  return rows.map((o) => ({
    officer_id: o.officer_id as number,
    serial: (o.serial as number) ?? null,
    officer_name: (o.officer_name as string) ?? null,
    rank_name: (o.rank_name as string) ?? null,
    l_lagna_type_c: o.l_lagna_type_c != null ? Number(o.l_lagna_type_c) : null,
    final_eval: (o.final_eval as string) ?? null,
    decision: tamseelDecision(o.final_eval as string | null),
    done: (o.done as number) ?? 0,
  }));
}
