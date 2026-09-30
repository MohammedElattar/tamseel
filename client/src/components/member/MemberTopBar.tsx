import { toArabicDigits } from '../../utils/format';

interface Props {
  // The active officer's target post line (لشغل وظيفة ...). Omitted for a guest and while no
  // officer is active.
  job?: string;
  current?: number | null;
  remaining: number;
  total: number;
}

// Counter chip, mirroring the legacy الحالي / المتبقي / الإجمالي boxes of the header.
// Deliberately compact: these are session bookkeeping, not the content of the screen.
function Counter({ label, value, highlight }: { label: string; value: number | null | undefined; highlight?: boolean }) {
  return (
    <div
      className={`min-w-[3.5rem] rounded-md border px-2 py-0.5 text-center ${
        highlight ? 'border-blue-800 bg-blue-50' : 'border-gray-300 bg-gray-50'
      }`}
    >
      <dt className={`text-[0.875rem] font-bold leading-tight ${highlight ? 'text-blue-900' : 'text-gray-600'}`}>{label}</dt>
      <dd className={`text-[1rem] font-bold leading-tight ${highlight ? 'text-blue-900' : 'text-gray-900'}`}>
        {value == null ? '-' : toArabicDigits(value)}
      </dd>
    </div>
  );
}

// Screen header: the post the active officer is presented for (centre) and where the session has
// got to (end). The seated member is named in the layout navbar above.
export default function MemberTopBar({ job, current, remaining, total }: Props) {
  return (
    <section
      aria-label="بيانات الجلسة"
      className="flex items-center gap-x-4 rounded-xl border-2 border-gray-300 bg-white px-4 py-2 shadow-sm"
    >
      {/* Empty start-side zone mirrors the counters so the job box sits dead-centre. */}
      <div className="flex-1" />

      {job && (
        <div className="w-fit max-w-full rounded-2xl bg-gray-800 px-8 py-2 text-center text-2xl font-bold leading-tight text-white">
          {toArabicDigits(job)}
        </div>
      )}

      {/* Counters take the mirror zone and hug the far end (left in RTL). */}
      <dl className="flex flex-1 flex-wrap items-center justify-end gap-2">
        <Counter label="الحالي" value={current} highlight />
        <Counter label="المتبقي" value={remaining} />
        <Counter label="الإجمالي" value={total} />
      </dl>
    </section>
  );
}
