interface NavProps {
  nextLabel: string;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface Props {
  buttons: { label: string; onClick: () => void }[];
  nav?: NavProps;
}

// Fixed footer: officer navigation on the right, reference screens on the left. Pinned to
// the viewport so the commander reaches التالي without scrolling past a long case file.
// The page reserves matching bottom padding so nothing ends up hidden behind it.
export default function MemberActionBar({ buttons, nav }: Props) {
  // A fill of its own per action, so each button is recognised by colour before it is
  // read. All three avoid the green / red / amber / orange / rose family, which carries
  // the meaning of a vote everywhere else on this screen.
  const btn =
    'min-h-[60px] rounded-lg border-2 px-8 py-3 text-xl font-bold text-white transition-colors ' +
    'disabled:cursor-not-allowed disabled:opacity-40';
  const nextBtn = `${btn} min-w-[9rem] border-blue-900 bg-blue-700 hover:bg-blue-800`;
  const prevBtn = `${btn} min-w-[9rem] border-slate-800 bg-slate-600 hover:bg-slate-700`;
  const refBtn = `${btn} border-cyan-950 bg-cyan-800 hover:bg-cyan-900`;

  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t-2 border-gray-300 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.1)]">
      {/* One group: التالي leads (nearest the screen edge the commander reaches for),
          then السابق, then the reference screens right beside it. */}
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2 px-4 py-2">
        {nav && (
          <>
            <button type="button" onClick={nav.onNext} disabled={nav.nextDisabled} className={nextBtn}>
              {nav.nextLabel}
            </button>
            <button type="button" onClick={nav.onPrev} disabled={nav.prevDisabled} className={prevBtn}>
              السابق
            </button>
          </>
        )}

        {buttons.map(b => (
          <button key={b.label} type="button" onClick={b.onClick} className={refBtn}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
