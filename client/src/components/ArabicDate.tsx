import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toArabicDigits, toWesternDigits } from '../utils/format';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
// Sunday-first (JS getDay 0=Sun); renders right-to-left in the RTL grid.
const WEEKDAYS = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

const parseISO = (iso: string) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? { y, m: m - 1, d } : null;
};

const formatDMY = (iso: string) => {
  const p = parseISO(iso);
  return p ? `${pad(p.d)}-${pad(p.m + 1)}-${p.y}` : '';
};

// Parse a typed "DD-MM-YYYY" to ISO with strict validation (real calendar date), or null.
const parseTyped = (raw: string): string | null => {
  const parts = toWesternDigits(raw).split(/\D+/).filter(Boolean);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!(y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  // Reject impossible days (e.g. 31-02, 30-02) via Date round-trip.
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return toISO(y, m - 1, d);
};

const digitCount = (s: string) => toWesternDigits(s).replace(/\D/g, '').length;

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  disabled?: boolean;
}

export default function ArabicDate({ value, onChange, className = '', disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => (value ? toArabicDigits(formatDMY(value)) : ''));
  const wrapRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const parsed = parseISO(value);
  const today = new Date();
  const [view, setView] = useState(() =>
    parsed ? { y: parsed.y, m: parsed.m } : { y: today.getFullYear(), m: today.getMonth() }
  );

  // Sync the text when the value changes externally (calendar select / reset),
  // but keep the user's typing if it already represents the same date.
  useEffect(() => {
    setText(prev => (parseTyped(prev) === value && value ? prev : (value ? toArabicDigits(formatDMY(value)) : '')));
  }, [value]);

  useEffect(() => {
    if (open && parsed) setView({ y: parsed.y, m: parsed.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Position the (portaled) calendar under the input; keep it anchored on scroll/resize.
  useEffect(() => {
    if (!open) return;
    const computePos = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 256;
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      const estHeight = 300;
      const openUp = r.bottom + estHeight > window.innerHeight && r.top - estHeight > 0;
      setPos({ top: openUp ? r.top - estHeight - 4 : r.bottom + 4, left, width });
    };
    computePos();
    window.addEventListener('scroll', computePos, true);
    window.addEventListener('resize', computePos);
    return () => {
      window.removeEventListener('scroll', computePos, true);
      window.removeEventListener('resize', computePos);
    };
  }, [open]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Digits-only input auto-formatted as DD-MM-YYYY (mimics segmented native input).
  const handleType = (raw: string) => {
    const digits = toWesternDigits(raw).replace(/\D/g, '').slice(0, 8);
    let f = digits.slice(0, 2);
    if (digits.length > 2) f += '-' + digits.slice(2, 4);
    if (digits.length > 4) f += '-' + digits.slice(4, 8);
    setText(toArabicDigits(f));
    const iso = parseTyped(f);
    if (iso) onChange(iso);
    else if (digits === '') onChange('');
  };

  // Invalid only once a full date is typed but it isn't a real calendar date.
  const invalid = digitCount(text) === 8 && parseTyped(text) === null;

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prevMonth = () => setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const nextMonth = () => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
  const selectDay = (d: number) => { onChange(toISO(view.y, view.m, d)); setOpen(false); };

  const isSelected = (d: number) => parsed && parsed.y === view.y && parsed.m === view.m && parsed.d === d;
  const isToday = (d: number) =>
    today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;

  return (
    <div ref={wrapRef} className="relative">
      <div className={`input-field flex items-center justify-between gap-1 ${disabled ? 'bg-gray-100' : ''} ${invalid ? 'border-red-500 focus-within:ring-red-500' : ''} ${className}`}>
        <input
          type="text"
          value={text}
          onChange={e => handleType(e.target.value)}
          disabled={disabled}
          placeholder="يوم-شهر-سنة"
          inputMode="numeric"
          className="bg-transparent outline-none w-full"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => !disabled && setOpen(o => !o)}
          className="shrink-0 text-gray-400 hover:text-gray-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {invalid && <p className="text-xs text-red-600 mt-1">تاريخ غير صحيح</p>}

      {open && !disabled && pos && createPortal(
        <div
          ref={popupRef}
          dir="rtl"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 60 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="px-2 py-0.5 text-gray-500 hover:text-gray-800 text-lg">‹</button>
            <span className="font-medium text-sm">{MONTHS[view.m]} {toArabicDigits(view.y)}</span>
            <button type="button" onClick={nextMonth} className="px-2 py-0.5 text-gray-500 hover:text-gray-800 text-lg">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-1">
            {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {cells.map((d, i) =>
              d === null ? (
                <div key={i} />
              ) : (
                <button
                  type="button"
                  key={i}
                  onClick={() => selectDay(d)}
                  className={`rounded py-1 hover:bg-blue-50 ${
                    isSelected(d)
                      ? 'bg-blue-600 text-white hover:bg-blue-600'
                      : isToday(d)
                      ? 'border border-blue-400'
                      : ''
                  }`}
                >
                  {toArabicDigits(d)}
                </button>
              )
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
