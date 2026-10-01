import { useCallback, useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { toArabicDigits } from '../utils/format';

export interface LightboxImage {
  src: string;
  alt: string;
}

// Matches the exit transition (duration-200) so the overlay unmounts once it has faded out.
const EXIT_MS = 200;

// Full-screen photo preview. Fades in with a gentle zoom; closes on Esc, a click on the dark
// backdrop or the × button. With several photos it steps through them with the side arrows,
// the arrow keys or a swipe — ArrowLeft / swipe-left move forward, as the page reads
// right-to-left. The page behind stays still while it is open, and focus returns to the photo
// that opened it.
export default function ImageLightbox({ images, index, onClose }: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index);
  const [leaving, setLeaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const many = images.length > 1;

  const close = useCallback(() => setLeaving(true), []);
  const step = useCallback(
    (delta: number) => setCurrent(c => (c + delta + images.length) % images.length),
    [images.length],
  );

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onClose, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [leaving, onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (many && e.key === 'ArrowLeft') step(1);
      else if (many && e.key === 'ArrowRight') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, many, step]);

  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    if (!many || start == null) return;
    const dx = e.changedTouches[0].clientX - start;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
  };

  const img = images[current] ?? images[0];
  const roundBtn =
    'absolute flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg ' +
    'transition hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400 ' +
    'motion-reduce:transition-none';
  const icon = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, className: 'h-7 w-7' };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={img.alt}
      onClick={close}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={onTouchEnd}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm transition-opacity duration-200 motion-reduce:animate-none motion-reduce:transition-none ${
        leaving ? 'opacity-0' : 'animate-[lightbox-fade-in_200ms_ease-out]'
      }`}
    >
      <img
        key={img.src}
        src={img.src}
        alt={img.alt}
        onClick={e => e.stopPropagation()}
        className={`max-h-[86vh] max-w-[86vw] select-none rounded-xl object-contain shadow-2xl transition duration-200 ease-out motion-reduce:animate-none motion-reduce:transition-none ${
          leaving ? 'scale-95 opacity-0' : 'animate-[lightbox-photo-in_220ms_ease-out]'
        }`}
      />

      <button
        ref={closeRef}
        type="button"
        onClick={e => { e.stopPropagation(); close(); }}
        aria-label="إغلاق المعاينة"
        className={`${roundBtn} end-5 top-5`}
      >
        <svg {...icon}><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      {many && (
        <>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); step(-1); }}
            aria-label="الصورة السابقة"
            className={`${roundBtn} start-5 top-1/2 -translate-y-1/2`}
          >
            <svg {...icon}><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); step(1); }}
            aria-label="الصورة التالية"
            className={`${roundBtn} end-5 top-1/2 -translate-y-1/2`}
          >
            <svg {...icon}><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-lg font-bold text-white">
            {toArabicDigits(current + 1)} / {toArabicDigits(images.length)}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
