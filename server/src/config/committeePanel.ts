export interface PanelMember {
  slot: string;
  jobCode: number;
  serial: number;
  position: string;
  // Default seeded identity of the officer holding the seat: shown on the member/voting screens
  // and used to seed a fresh DB so the panel comes with real names/ranks. Still editable on the
  // الأعضاء page afterwards (edits survive restarts; a reseed restores these defaults).
  name?: string;
  rank?: string;
  // Alternate spellings of this seat's title as they appear in the imported MEMBERS.JOB_N, used
  // to match an imported member to this seat when its wording differs from `position` (extra
  // words / hamza / spacing). Matching is done on an Arabic-normalized form, so only genuinely
  // different phrasings need listing here. See services/panelMembers.ts.
  matchTitles?: string[];
}

// Fixed panel of senior commanders loaded by "تحميل الأعضاء" in the legacy form.
// Each member is identified by their job code; the EVAL slot is their login username.
// Serials 2 and 4 are intentionally skipped (those slots were disabled in the legacy).
export const COMMITTEE_PANEL: PanelMember[] = [
  { slot: 'EVAL1', jobCode: 4185, serial: 1, position: 'قائد القوات البحرية', name: 'محمود عادل محمود فوزى', rank: 'فريق' },
  { slot: 'EVAL2', jobCode: 4187, serial: 3, position: 'رئيس أركان القوات البحرية', name: 'محمد حسن عبد الرحمن الشربينى', rank: 'لواء بحري أ.ح' },
  { slot: 'EVAL3', jobCode: 107181, serial: 5, position: 'مدير ادارة شئون الضباط', name: 'x', rank: 'لواء أ.ح' },
  { slot: 'EVAL8', jobCode: 328, serial: 6, position: 'مساعد القائد للشئون الفنية', name: 'سامح جمال بحيرى سعيد', rank: 'لواء بحري', matchTitles: ['مساعد قائد القوات للشئون الفنية'] },
  { slot: 'EVAL4', jobCode: 19, serial: 7, position: 'رئيس شعبة العمليات', name: 'محمد نبيل إبراهيم أحمد', rank: 'لواء بحري أ.ح', matchTitles: ['رئيس شعبة العمليات البحرية'] },
  { slot: 'EVAL6', jobCode: 28, serial: 8, position: 'رئيس شعبة التنظيم و الإدارة البحرية', name: 'محسن محمد أحمد حتاته', rank: 'لواء بحري أ.ح', matchTitles: ['رئيس شعبة التنظيم والادارة البحرية'] },
  { slot: 'EVAL10', jobCode: 111767, serial: 9, position: 'قائد الاسطول الشمالي', name: 'رامى أحمد إسماعيل محمد', rank: 'لواء بحري أ.ح' },
  { slot: 'EVAL5', jobCode: 67, serial: 10, position: 'رئيس شعبة التدريب', name: 'عمر محمد فتحى مصطفى الصباغ', rank: 'لواء بحري أ.ح', matchTitles: ['رئيس شعبة التدريب البحرى'] },
  { slot: 'EVAL7', jobCode: 111601, serial: 11, position: 'قائد الاسطول الجنوبي', name: 'هانى السيد عبد العزيز خليل', rank: 'لواء بحري أ.ح' },
  { slot: 'EVAL9', jobCode: 202, serial: 12, position: 'رئيس فرع شئون الضباط', name: 'محمد رشدي السيد دعبس', rank: 'عميد بحري' },
];
