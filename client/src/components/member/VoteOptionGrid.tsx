import VoteButton from './VoteButton';
import type { VoteChoice } from './voteOptions';

type Cols = 1 | 2 | 3;

// Two independent column counts, because the panel lives in two very different boxes:
// `flow` is the full-width single column used on tablets and narrow laptops, `rail` is
// the 19–23rem action rail on the right of the desktop grid. Both are chosen so a label
// never wraps into an unreadable sliver.
// Option sets are configured per سبب العرض, so this scales to any count and any label length
// rather than enumerating the sets that happen to exist: a third of the panel fits about 12
// characters and a half about 16, and anything longer takes its own full-width row.
function columnsFor(choices: VoteChoice[]): { flow: Cols; rail: Cols } {
  const n = choices.length;
  const longest = choices.reduce((m, c) => Math.max(m, c.label.length), 0);
  if (n === 1) return { flow: 1, rail: 1 };

  const fits = (cols: Cols) => longest <= (cols === 3 ? 12 : 16);
  // n % 3 === 1 is skipped so a three-wide grid never ends on a single trailing button.
  const flow: Cols = n >= 3 && n % 3 !== 1 && fits(3) ? 3 : fits(2) ? 2 : 1;
  const rail: Cols = n % 2 === 0 && fits(2) ? 2 : 1;
  return { flow, rail };
}

const FLOW_CLASS: Record<Cols, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
};

const RAIL_CLASS: Record<Cols, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
};

// A trailing option that would sit alone on its own row is stretched across the full
// width instead, so no layout ever ends on a lonely half-width button.
const SPAN_CLASS: Record<Cols, string> = {
  1: '',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
};

const RAIL_SPAN_CLASS: Record<Cols, string> = {
  1: '',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
};

interface Props {
  choices: VoteChoice[];
  columns?: Cols;
  selected: (c: VoteChoice) => boolean;
  saving: (c: VoteChoice) => boolean;
  disabled: boolean;
  onSelect: (c: VoteChoice) => void;
}

export default function VoteOptionGrid({
  choices, columns, selected, saving, disabled, onSelect,
}: Props) {
  const auto = columnsFor(choices);
  const flow = columns ?? auto.flow;
  const rail = columns ?? auto.rail;
  const n = choices.length;
  const flowOrphan = flow > 1 && n % flow === 1;
  const railOrphan = rail > 1 && n % rail === 1;

  return (
    <div className={`grid items-stretch gap-3 ${FLOW_CLASS[flow]} ${RAIL_CLASS[rail]}`}>
      {choices.map((c, i) => {
        const last = i === n - 1;
        return (
          <div
            key={c.opinion}
            className={[
              'flex',
              last && flowOrphan ? SPAN_CLASS[flow] : '',
              last && railOrphan ? RAIL_SPAN_CLASS[rail] : '',
              last && flowOrphan && !railOrphan ? 'lg:col-span-1' : '',
            ].join(' ')}
          >
            <VoteButton
              label={c.label}
              tone={c.tone}
              selected={selected(c)}
              saving={saving(c)}
              disabled={disabled}
              onClick={() => onSelect(c)}
            />
          </div>
        );
      })}
    </div>
  );
}
