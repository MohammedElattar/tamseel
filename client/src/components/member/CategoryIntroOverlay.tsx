import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toArabicDigits } from '../../utils/format';

export interface CategoryIntro {
  id: number;
  name: string;
  officer_count: number;
}

interface Props {
  // The pending intro from /current; null once the commander has pressed متابعة.
  intro: CategoryIntro | null;
  // Commander/deputy only: متابعة opens the category's first officer on every screen. Without it
  // the overlay waits for them.
  onContinue?: () => Promise<void>;
  error?: string;
}

// Matches the exit transition (duration-200) so the overlay unmounts once it has faded out.
const EXIT_MS = 200;
// The smallest the category name shrinks to (text-4xl) before it is allowed to wrap.
const MIN_TITLE_REM = 2.25;

// ترتيب اللجنة: when the session reaches a new category, a full-page card covers the screen (members,
// guest, voting display) until the commander presses متابعة. That is stored on the server, so a
// refresh afterwards doesn't bring it back. The page behind stays blurred and unreachable.
export default function CategoryIntroOverlay({ intro, onContinue, error }: Props) {
  const [shown, setShown] = useState<CategoryIntro | null>(intro);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (intro) {
      setShown(intro);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const t = window.setTimeout(() => setShown(null), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [intro]);

  const open = shown != null;
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    return () => {
      document.body.style.overflow = overflow;
      root?.removeAttribute('inert');
    };
  }, [open]);

  // The category name stays on one line: the card widens to fit it (up to the screen width), and a
  // name still too long is scaled down until it fits.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      el.style.whiteSpace = '';
      const avail = el.clientWidth;
      const natural = el.scrollWidth;
      if (natural <= avail) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const size = Math.floor((parseFloat(getComputedStyle(el).fontSize) * avail) / natural) - 1;
      if (size >= MIN_TITLE_REM * rem) {
        el.style.fontSize = `${size}px`;
      } else {
        el.style.fontSize = `${MIN_TITLE_REM}rem`;
        el.style.whiteSpace = 'normal';
      }
    };
    fit();
    let live = true;
    document.fonts?.ready.then(() => { if (live) fit(); });
    window.addEventListener('resize', fit);
    return () => {
      live = false;
      window.removeEventListener('resize', fit);
    };
  }, [shown?.id, shown?.name]);

  if (!shown) return null;

  const handleContinue = async () => {
    if (!onContinue) return;
    setBusy(true);
    try {
      await onContinue();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`ترتيب اللجنة: ${shown.name}`}
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/75 p-6 backdrop-blur-md transition-opacity duration-200 motion-reduce:animate-none motion-reduce:transition-none ${
        leaving ? 'opacity-0' : 'animate-[lightbox-fade-in_200ms_ease-out]'
      }`}
    >
      <section
        key={shown.id}
        className={`w-fit min-w-[min(56rem,100%)] max-w-full rounded-3xl bg-white px-10 py-14 text-center shadow-2xl transition duration-200 ease-out motion-reduce:animate-none motion-reduce:transition-none ${
          leaving ? 'scale-95 opacity-0' : 'animate-[category-intro-in_450ms_ease-out]'
        }`}
      >
        <h2 ref={titleRef} className="whitespace-nowrap text-7xl font-extrabold leading-tight text-gray-900">
          {toArabicDigits(shown.name)}
        </h2>
        <p className="mx-auto mt-8 w-fit rounded-xl bg-gray-100 px-6 py-2.5 text-2xl font-bold text-gray-700">
          عدد الضباط: {toArabicDigits(shown.officer_count)}
        </p>

        {onContinue ? (
          <button
            type="button"
            autoFocus
            onClick={handleContinue}
            disabled={busy || leaving}
            className="mt-12 min-h-[80px] min-w-[18rem] rounded-2xl border-2 border-blue-900 bg-blue-700 px-14 text-4xl font-bold text-white shadow-lg transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            متابعة
          </button>
        ) : (
          <p className="mt-12 flex items-center justify-center gap-3 text-3xl font-bold text-gray-600">
            <span aria-hidden="true" className="inline-flex h-3.5 w-3.5 animate-ping rounded-full bg-blue-600" />
            في انتظار السيد القائد للمتابعة
          </p>
        )}

        {error && <p role="alert" className="mt-5 text-xl font-bold text-red-700">{error}</p>}
      </section>
    </div>,
    document.body,
  );
}
