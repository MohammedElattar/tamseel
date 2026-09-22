// Promotion-type groups (l_lagna_type_c) from the legacy FINAL_DECISION formula.
const PROMOTION_TYPES = [2, 6, 8];

// Committee decision text = final_eval (1=يستمر, 2=يحال, -1=يؤجل) combined with the
// officer's promotion type. Mirrors the legacy LAGNA_DECISIONS.FINAL_DECISION logic.
export function finalDecision(finalEval: number | null, lLagnaTypeC: number | null): string {
  if (finalEval == null) return '';
  // Postpone (يؤجل) is the commander's defer decision; its wording does not depend on the
  // promotion type, so it resolves before (and independently of) the يستمر/يحال branches.
  if (finalEval === -1) return 'يؤجل';
  if (lLagnaTypeC == null) return '';
  const promotion = PROMOTION_TYPES.includes(lLagnaTypeC);
  // Promotion outcomes use the same wording as the التجديد/الترقي vote buttons (يستمر/يحال).
  if (finalEval === 1) return promotion ? 'يستمر' : 'يجدد';
  if (finalEval === 2) return promotion ? 'يحال' : 'لا يجدد';
  return '';
}

// التمثيل العسكري final decision label: the commander's تصدق / لا يتصدق, stored on
// committee_officers.final_eval as 1 (تصدق) / 2 (لا يتصدق).
export function tamseelDecision(finalEval: number | string | null): string {
  const n = finalEval == null ? null : Number(finalEval);
  if (n === 1) return 'تصدق';
  if (n === 2) return 'لا يتصدق';
  return '';
}

// Single member vote marker: 1 -> يرقى/يستمر (P), 0 -> يحال (O), else pending (blank).
export function opinionMarker(userOpinion: number | null): 'for' | 'against' | 'pending' {
  if (userOpinion === 1) return 'for';
  if (userOpinion === 0) return 'against';
  return 'pending';
}

// توصية القائد بالإحالة (commander's referral recommendation) is ONE field with two encodings:
// the imported bulletin stores it as text on officers.tawsya_ka2ed (decoded from
// EVAL_KAED_TAWSEYA.TAWSYA), while the per-committee toggle stores it as 0/1 on
// committee_officers.kaed_tawsya. Both agree that 0 = recommend referral, 1 = do not — so we
// seed the toggle from the imported text on load and render the toggle's value everywhere.
export function kaedTawsyaFromText(text: string | null): number | null {
  if (!text) return null;
  if (!text.includes('وصى')) return null;             // not a توصية string
  return text.trimStart().startsWith('لا') ? 1 : 0;   // 'لا يوصى/لا اوصى' = 1, else 'يوصى/اوصى' = 0
}

export function kaedTawsyaLabel(value: number | null): string | null {
  if (value === 0) return 'يوصى بالإحالة';
  if (value === 1) return 'لا يوصى بلإحالة';
  return null;
}
