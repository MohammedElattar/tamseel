// التمثيل العسكري final decision label: the commander's تصدق / لا يتصدق, stored on
// committee_officers.final_eval as 1 (تصدق) / 2 (لا يتصدق).
export function tamseelDecision(finalEval: number | string | null): string {
  const n = finalEval == null ? null : Number(finalEval);
  if (n === 1) return 'تصدق';
  if (n === 2) return 'لا يتصدق';
  return '';
}

// توصية القائد بالإحالة (commander's referral recommendation) is ONE field with two encodings:
// the imported bulletin stores it as text on officers.tawsya_ka2ed (decoded from
// EVAL_KAED_TAWSEYA.TAWSYA), while the per-committee toggle stores it as 0/1 on
// committee_officers.kaed_tawsya. Both agree that 0 = recommend referral, 1 = do not — so we
// seed the toggle from the imported text on load.
export function kaedTawsyaFromText(text: string | null): number | null {
  if (!text) return null;
  if (!text.includes('وصى')) return null;             // not a توصية string
  return text.trimStart().startsWith('لا') ? 1 : 0;   // 'لا يوصى/لا اوصى' = 1, else 'يوصى/اوصى' = 0
}
