import { toArabicDigits } from '../../utils/format';
import { TONE_ROW, ToneOrNeutral } from '../../constants/voteTone';

// Legacy EVAL_LAGNA_RESULTS opinion wording for tagdded, keyed on the officer's l_lagna_type_c.
// The commander may also postpone (-1 -> يؤجل).
function tagddedLabel(opinion: number, lagnaTypeC: number | null): string {
  if (opinion === -1) return 'يؤجل';
  if (lagnaTypeC != null && [1, 3, 4, 5, 7, 9].includes(lagnaTypeC)) {
    return opinion === 1 ? 'يجدد' : 'لا يجدد';
  }
  if (lagnaTypeC != null && [2, 6, 8].includes(lagnaTypeC)) {
    return opinion === 1 ? 'يستمر' : 'يحال';
  }
  return opinion === 1 ? 'موافق' : 'غير موافق';
}

// tagdded has no configurable tones, so map its three fixed opinions to colours directly.
function tagddedTone(opinion: number): ToneOrNeutral {
  if (opinion === 1) return 'green';
  if (opinion === -1) return 'amber';
  return 'red';
}

// Commander-only per-member breakdown: each member's row is filled with the colour of the
// option they picked (or a neutral "لم يصوّت"), with a large, high-contrast decision label.
export default function MemberVotesPanel({ officer, memberVotes }: {
  committeeType?: string; officer: any; memberVotes: any[];
}) {
  const decisionFor = (v: any): { text: string; tone: ToneOrNeutral; voted: boolean } => {
    if (!v.voted) return { text: 'لم يصوّت', tone: 'neutral', voted: false };
    return {
      text: tagddedLabel(v.user_opinion, officer?.l_lagna_type_c ?? null),
      tone: tagddedTone(v.user_opinion),
      voted: true,
    };
  };

  return (
    <section
      aria-label="تصويت الأعضاء (تفصيلي)"
      className="rounded-xl border-2 border-gray-300 bg-white shadow-sm lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
    >
      <h2 className="shrink-0 rounded-t-lg border-b-2 border-gray-200 bg-gray-50 px-3 py-2 text-lg font-bold text-gray-800">
        تصويت الأعضاء (تفصيلي)
      </h2>
      {/* The list fills the column and scrolls in place only when it truly overflows. The decision
          text (which can be long for edarya cases) always wraps in full and is never clipped. Rows
          are kept compact — a small name label above the decision — so many members still fit before
          any scrolling is needed. */}
      <div
        role="group"
        aria-label="قائمة أصوات الأعضاء"
        tabIndex={0}
        className="max-h-[24rem] overflow-y-auto overscroll-contain p-2 lg:max-h-none lg:min-h-0 lg:flex-1"
      >
        <ul className="space-y-1">
          {memberVotes.map((v, i) => {
            const d = decisionFor(v);
            return (
              <li key={i}>
                <div
                  className={`rounded-md border border-s-4 px-2.5 py-1 ${TONE_ROW[d.tone]} ${
                    d.voted ? '' : 'border-dashed'
                  }`}
                >
                  <div className="text-xs font-bold leading-tight opacity-90 break-words">
                    {toArabicDigits(v.name)}
                  </div>
                  <div className="text-sm font-extrabold leading-snug break-words">
                    {toArabicDigits(d.text)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
