import { useLayoutEffect, useRef, useState } from 'react';
import { toArabicDigits } from '../../utils/format';

interface Props {
  // Omitted for a guest: it holds no seat and no role, so the header carries no identity.
  // voterRole is the seat's position (top line); voterName is the person's "الرتبة / الاسم"
  // (second line), shown only when a distinct name has been set for the seat.
  voterRole?: string;
  voterName?: string;
  // Kashida (Justify High) stretch is applied only when true — used for the قائد القوات البحرية seat.
  kashida?: boolean;
  current?: number | null;
  remaining: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Kashida (تطويل) justification — Word's "Justify High" / توزيع مرتفع.
// Chrome/Edge (Blink) ignore CSS kashida (text-justify: inter-character), so we emulate it by
// inserting tatweel (ـ) characters to stretch the word to the line width. This renders the same
// in every browser.
// ---------------------------------------------------------------------------
const TATWEEL = '\u0640';
// Letters that do NOT join to the letter after them — a tatweel placed after one of these would
// float, so those positions are skipped.
const NO_LEFT_JOIN = new Set(['ء', 'آ', 'أ', 'ؤ', 'إ', 'ا', 'ة', 'د', 'ذ', 'ر', 'ز', 'و', 'ى']);
const isArabicLetter = (ch: string) => ch >= '\u0621' && ch <= '\u064A';

// Insertion points: after a letter that joins leftwards and before another joining Arabic letter.
function kashidaSlots(text: string): number[] {
  const slots: number[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (isArabicLetter(text[i]) && !NO_LEFT_JOIN.has(text[i]) && isArabicLetter(text[i + 1]) && text[i + 1] !== 'ء') {
      slots.push(i + 1);
    }
  }
  return slots;
}

// Spread `total` tatweels across the slots (round-robin) so the elongation is even.
function withKashida(text: string, slots: number[], total: number): string {
  if (total <= 0 || !slots.length) return text;
  const counts = new Array(slots.length).fill(0);
  for (let k = 0; k < total; k++) counts[k % slots.length]++;
  let out = '';
  let si = 0;
  for (let i = 0; i < text.length; i++) {
    if (si < slots.length && slots[si] === i) { out += TATWEEL.repeat(counts[si]); si++; }
    out += text[i];
  }
  return out;
}

let measureCanvas: HTMLCanvasElement | null = null;
function measureText(text: string, font: string): number {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

// A line that stretches its Arabic text to fill its own width using kashida. Recomputes when the
// text or the available width changes. The parent gives the line a fixed width so inserting
// tatweel never grows the box (which would otherwise feed back and loop).
function KashidaLine({ text, className, enabled }: { text: string; className?: string; enabled?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [out, setOut] = useState(text);

  useLayoutEffect(() => {
    if (!enabled) { setOut(text); return; }
    const el = ref.current;
    if (!el) return;
    const recompute = () => {
      const slots = kashidaSlots(text);
      const avail = el.clientWidth;
      if (!slots.length || avail <= 0) { setOut(text); return; }
      const cs = getComputedStyle(el);
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const natural = measureText(text, font);
      if (natural >= avail - 1) { setOut(text); return; }
      const per = measureText(text + TATWEEL, font) - natural;
      if (per <= 0.5) { setOut(text); return; }
      // Undershoot by a few px so the stretched line never exceeds the width (which, with
      // whitespace-nowrap, would push it wider than the box rather than wrap).
      const total = Math.max(0, Math.min(Math.floor((avail - natural - 4) / per), slots.length * 10));
      setOut(withKashida(text, slots, total));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, enabled]);

  return <p ref={ref} className={className}>{out}</p>;
}

// Counter chip, mirroring the legacy الحالي / المتبقي / الإجمالي boxes of the header.
// Deliberately compact: these are session bookkeeping, not the content of the screen.
function Counter({ label, value, highlight }: { label: string; value: number | null | undefined; highlight?: boolean }) {
  return (
    <div
      className={`min-w-[4.5rem] rounded-lg border px-3 py-1 text-center ${
        highlight ? 'border-blue-800 bg-blue-50' : 'border-gray-300 bg-gray-50'
      }`}
    >
      <dt className={`text-sm font-bold ${highlight ? 'text-blue-900' : 'text-gray-600'}`}>{label}</dt>
      <dd className={`text-lg font-bold leading-tight ${highlight ? 'text-blue-900' : 'text-gray-900'}`}>
        {value == null ? '-' : toArabicDigits(value)}
      </dd>
    </div>
  );
}

// Screen header: who is seated and voting (centre) and where the session has got to (end).
// The committee itself is named by type in the layout navbar above.
export default function MemberTopBar({ voterRole, voterName, kashida, current, remaining, total }: Props) {
  return (
    <section
      aria-label="بيانات الجلسة"
      className="flex items-center gap-x-4 rounded-xl border-2 border-gray-300 bg-white px-4 py-2 shadow-sm"
    >
      {/* Empty start-side zone mirrors the counters so the identity pill sits dead-centre. */}
      <div className="flex-1" />

      {(voterRole || voterName) && (
        // Sizes to its content but never below a comfortable minimum: short lines still get room
        // to stretch (kashida) to the minimum width, while a long name widens the box to fit it
        // instead of spilling out. (The kashida fill undershoots, so this never feeds back.)
        <div className="w-fit min-w-[28rem] max-w-full rounded-2xl bg-gray-800 px-8 py-2 text-center text-white">
          {voterRole && <KashidaLine text={voterRole} enabled={kashida} className="text-2xl font-bold leading-tight whitespace-nowrap" />}
          {voterName && <KashidaLine text={voterName} enabled={kashida} className="text-2xl font-bold leading-tight whitespace-nowrap" />}
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
