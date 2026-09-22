import { toArabicDigits } from '../utils/format';
import { TAGDDED_CHOICES } from './member/voteOptions';
import { TONE_TEXT, toneOf } from '../constants/voteTone';

// Inline per-option vote counts, keyed by the officer's ta3n_type for edarya (mirrors the
// member VoteTallyBox). counts is keyed by user_opinion value (string), from getVotingStatus.
export default function VoteBreakdown({ counts, className }: {
  committeeType?: string;
  ta3nType?: number | null;
  counts: Record<string, number> | null | undefined;
  className?: string;
}) {
  const opts = TAGDDED_CHOICES.map(c => ({ value: c.opinion, label: c.label, tone: c.tone }));
  const c = counts || {};
  return (
    <span className={`inline-flex flex-wrap gap-x-2 gap-y-0.5 justify-center ${className || ''}`}>
      {opts.map((o) => (
        <span key={o.value} className="whitespace-nowrap">
          <span className="text-gray-500">{o.label}</span>{' '}
          <b className={TONE_TEXT[toneOf(o.tone)]}>
            {toArabicDigits(c[String(o.value)] || 0)}
          </b>
        </span>
      ))}
    </span>
  );
}
