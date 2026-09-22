import type { ReactNode } from 'react';
import { toArabicDigits } from '../../utils/format';

// Case text arrives verbatim with dates and figures inside the wording, so any plain value
// reaching a field is shown in Arabic-Indic digits. JSX values pass through untouched.
const display = (v: ReactNode): ReactNode =>
  typeof v === 'string' || typeof v === 'number' ? toArabicDigits(v) : v;

// Shared building blocks for the officer case file in the centre column. Each fact is shown as
// a form-style field — its label sits ABOVE a defined, framed value box — inside clearly framed,
// titled sections, so the read-only case reads like a clean, structured government form.
// Everything here is display-only (there are no editable inputs on the member screen), so all
// fields share one framed read-only style. Nothing holds state or calls the API.

// A titled group of related fields. The section is a clearly framed white card (2px border +
// shadow) that stands apart from the slate officer canvas, topped by a tinted header band with
// a bottom rule and a colored accent bar, so it unmistakably reads as its own section.
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border-2 border-slate-400 bg-white shadow-sm">
      <h3 className="border-b-2 border-slate-400 bg-slate-100 px-4 py-3 text-base font-bold text-slate-800">
        {title}
      </h3>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

// A short fact: label above a compact, clearly framed value box.
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-bold text-slate-600">{label}</div>
      <div className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-lg font-bold text-slate-900 break-words">
        {value == null || value === '' ? '-' : display(value)}
      </div>
    </div>
  );
}

// A long fact (اتهام، حكم، تسوية…): an optional label above a roomy, clearly framed box that
// wraps in the document flow — no inner scrollbox. Renders nothing when empty, unless
// `showEmpty` is set — then the framed box is still drawn (blank) so the field reads as present.
export function DetailStatement({ label, value, showEmpty = false }: {
  label?: string; value: any; showEmpty?: boolean;
}) {
  const empty = value == null || value === '';
  if (empty && !showEmpty) return null;
  return (
    <div>
      {label && <div className="mb-1.5 text-sm font-bold text-slate-600">{label}</div>}
      <div className="min-h-[3rem] w-full whitespace-pre-wrap break-words rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-lg font-bold leading-relaxed text-slate-900">
        {empty ? '\u00A0' : display(value)}
      </div>
    </div>
  );
}
