import { useEffect, useId, useRef, type ReactNode } from 'react';

const WIDTHS = {
  wide: 'max-w-[110rem]',
  medium: 'max-w-[86rem]',
} as const;

interface Props {
  title: string;
  subtitle?: ReactNode;
  width?: keyof typeof WIDTHS;
  onClose: () => void;
  children: ReactNode;
}

// Dialog shell for everything opened from the live voting screen. It is deliberately
// large: a member around 70 reads these tables at arm's length on a shared monitor.
// Escape closes, the close button takes focus on open, focus returns to the trigger on
// close, and only the dialog body scrolls.
export default function MemberModal({ title, subtitle, width = 'medium', onClose, children }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir="rtl"
        onClick={e => e.stopPropagation()}
        className={`my-auto flex max-h-[94dvh] w-full flex-col rounded-2xl bg-white shadow-2xl ${WIDTHS[width]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 rounded-t-2xl border-b-2 border-gray-300 bg-white px-5 py-3">
          <div className="min-w-0">
            <h3 id={titleId} className="text-2xl font-bold leading-tight text-gray-900">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-base text-gray-700 break-words">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-[46px] shrink-0 rounded-lg border-2 border-gray-600 bg-white px-5 py-2 text-base font-bold text-gray-900 transition-colors hover:bg-gray-100"
          >
            إغلاق
          </button>
        </div>

        {/* The single scroll region of the dialog. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
