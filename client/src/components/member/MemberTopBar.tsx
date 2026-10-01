import { toArabicDigits } from '../../utils/format';

interface Props {
  // The active officer's target post (the لشغل وظيفة value). Omitted for a guest, while no
  // officer is active, and when the officer has none.
  job?: string;
  // The active officer's ترتيب اللجنة category, when he has one.
  category?: string | null;
  current?: number | null;
  remaining: number;
  total: number;
  // Rendered inside the voting card's officer box instead of as its own framed bar.
  embedded?: boolean;
}

// Counter chip, mirroring the legacy الحالي / المتبقي / الإجمالي boxes of the header.
// Kept no taller than the job box: these are session bookkeeping, not the content of the screen.
function Counter({ label, value, highlight }: { label: string; value: number | null | undefined; highlight?: boolean }) {
  return (
    <div
      className={`min-w-[4.5rem] rounded-md border px-2 py-0.5 text-center ${
        highlight ? 'border-blue-800 bg-blue-50' : 'border-gray-300 bg-gray-50'
      }`}
    >
      <dt className={`text-[1rem] font-bold leading-tight ${highlight ? 'text-blue-900' : 'text-gray-600'}`}>{label}</dt>
      <dd className={`text-[1.25rem] font-bold leading-tight ${highlight ? 'text-blue-900' : 'text-gray-900'}`}>
        {value == null ? '-' : toArabicDigits(value)}
      </dd>
    </div>
  );
}

// Screen header: the active officer's category (start), the post he is presented for (centre) and
// where the session has got to (end). The seated member is named in the layout navbar above.
export default function MemberTopBar({ job, category, current, remaining, total, embedded }: Props) {
  const categoryBox = category && (
    <div className="shrink-0 rounded-md border border-indigo-800 bg-indigo-50 px-3 py-0.5 text-center">
      <p className="text-[1rem] font-bold leading-tight text-indigo-900">ترتيب اللجنة</p>
      <p className="text-[1.25rem] font-bold leading-tight text-indigo-900">{toArabicDigits(category)}</p>
    </div>
  );

  return (
    <section
      aria-label="بيانات الجلسة"
      className={`flex items-center gap-x-4 ${
        embedded ? '' : 'rounded-xl border-2 border-gray-300 bg-white px-4 py-2 shadow-sm'
      }`}
    >
      {/* The start-side zone mirrors the counters so the job box sits dead-centre, and holds the
          category. Embedded in the officer box, the job box starts right after the category
          instead so a long title gets the width. */}
      {embedded ? categoryBox : <div className="flex flex-1 items-center">{categoryBox}</div>}

      {job && (
        <div className={`w-fit min-w-0 max-w-full rounded-2xl bg-gray-800 py-2 text-center text-2xl font-bold leading-tight text-white ${
          embedded ? 'px-5' : 'px-8'
        }`}>
          {toArabicDigits(job)}
        </div>
      )}

      {/* Counters take the mirror zone and hug the far end (left in RTL). */}
      <dl className={`flex items-center justify-end gap-2 ${embedded ? 'ms-auto shrink-0' : 'flex-1 flex-wrap'}`}>
        <Counter label="الحالي" value={current} highlight />
        <Counter label="المتبقي" value={remaining} />
        <Counter label="الإجمالي" value={total} />
      </dl>
    </section>
  );
}
