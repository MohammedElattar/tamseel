import { toArabicDigits } from '../../utils/format';
import { TAGDDED_CHOICES } from './voteOptions';
import type { VoteTone } from '../../constants/voteTone';

// Light tally tint for tagdded: keeps the يستمر=green / يحال=red / يؤجل=amber identity of the
// commander's vote buttons but as a soft pale mark (not a solid fill), so the tally reads at a
// glance without overpowering the screen. The count sits in a slightly stronger tint chip.
const TALLY_TONE: Record<VoteTone, { row: string; chip: string }> = {
  green: { row: 'border-green-200 bg-green-50 text-green-900', chip: 'bg-green-100 text-green-900' },
  red: { row: 'border-red-200 bg-red-50 text-red-900', chip: 'bg-red-100 text-red-900' },
  amber: { row: 'border-amber-300 bg-amber-50 text-amber-950', chip: 'bg-amber-100 text-amber-950' },
  orange: { row: 'border-orange-200 bg-orange-50 text-orange-900', chip: 'bg-orange-100 text-orange-900' },
  rose: { row: 'border-rose-200 bg-rose-50 text-rose-900', chip: 'bg-rose-100 text-rose-900' },
};

export default function VoteTallyBox({ tally }: {
  committeeType?: string; ta3nType?: number | null; tally: any;
}) {
  if (!tally) return null;
  const labels: { key: string; label: string; tone?: VoteTone }[] =
    TAGDDED_CHOICES.map(c => ({ key: String(c.opinion), label: c.label, tone: c.tone }));
  const counts = tally.counts || {};

  return (
    <section
      aria-label="تصويت الأعضاء"
      className="rounded-xl border-2 border-gray-300 bg-white shadow-sm"
    >
      <div className="rounded-t-lg border-b-2 border-gray-200 bg-gray-50 px-3 py-2">
        <h2 className="text-lg font-bold text-gray-800">تصويت الأعضاء</h2>
        <p className="text-sm text-gray-700">
          صوّت {toArabicDigits(tally.voted)} من {toArabicDigits(tally.total)}
        </p>
      </div>
      {/* Rows, not cells: any option label length stays readable in this narrow column.
          Colour each row (light tint) to echo the commander's vote buttons below. */}
      <ul className="space-y-2 p-3">
        {labels.map(l => {
          const t = TALLY_TONE[(l.tone ?? 'green') as VoteTone];
          return (
            <li
              key={l.key}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${t.row}`}
            >
              <span className="min-w-0 text-base font-bold break-words">{l.label}</span>
              <span className={`shrink-0 rounded-lg px-3 py-0.5 text-lg font-bold ${t.chip}`}>
                {toArabicDigits(counts[l.key] ?? 0)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
