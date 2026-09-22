import { TONE_CARD, toneOf, type ToneOrNeutral as Tone } from '../../constants/voteTone';
import { toArabicDigits } from '../../utils/format';

// A read-only decision box: قرار اللجنة التمهيدية above the tally, القرار النهائي under
// the portrait — a "label over a framed value" shape. When `empty` it renders in a muted,
// disabled look with the placeholder value inside the frame.
export default function DecisionCard({ title, value, tone = 'neutral', empty = false }: {
  title: string;
  value: string;
  tone?: Tone;
  empty?: boolean;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-xl border-2 shadow-sm ${empty ? 'border-gray-200 bg-gray-100' : 'border-gray-300 bg-white'}`}
    >
      <h2
        className={`rounded-t-lg border-b-2 px-3 py-1 text-base font-bold ${
          empty ? 'border-gray-200 bg-gray-100 text-gray-500' : 'border-gray-200 bg-gray-50 text-gray-800'
        }`}
      >
        {title}
      </h2>
      <div className="p-2">
        <p
          className={`flex min-h-[3.25rem] items-center justify-center rounded-lg border-2 px-3 py-2 text-center text-xl font-bold break-words ${
            empty ? 'border-dashed border-gray-300 bg-gray-100 text-gray-400' : TONE_CARD[toneOf(tone)]
          }`}
        >
          {toArabicDigits(value)}
        </p>
      </div>
    </section>
  );
}
