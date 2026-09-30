import { useLayoutEffect, useRef, useState } from 'react';

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
export default function KashidaLine({ text, className, enabled }: { text: string; className?: string; enabled?: boolean }) {
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
