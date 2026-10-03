import { useState, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { toArabicDigits, toWesternDigits } from '../../utils/format';
import OfficerPhoto from './OfficerPhoto';

export interface EvalItem {
  id: number;
  serial: number;
  name: string;
  max_degree: number;
  kind: string;          // 'computed' (مسير الخدمة) | 'manual'
  source: string | null;
}

interface Props {
  officer: any;
  evalItems: EvalItem[];
  isCommander: boolean;
  myVote: any;
  saving: boolean;
  voting: boolean;
  pendingVote: { opinion: number } | null;
  error: string;
  onSaveScores: (scores: { item_id: number; score: number | null }[]) => void;
  onVote: (opinion: number) => void;
  tally: any;
  memberVotes: any[];
  commanderName: string;
  // Session bar (لشغل وظيفة + counters), shown at the top of the officer box.
  header?: ReactNode;
}

const pctOf = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) : 0);
const fmt = (n: number) => toArabicDigits(Number.isInteger(n) ? String(n) : n.toFixed(2));

// One officer-info fact: the label, then its value (a dash when empty).
function InfoField({ label, value, warn }: { label: string; value: any; warn?: boolean }) {
  return (
    <>
      <dt className="shrink-0 text-xl font-bold text-slate-600">{label}</dt>
      <dd className={`min-w-0 text-2xl font-bold break-words ${warn ? 'text-red-700' : 'text-slate-900'}`}>
        {value == null || value === '' ? '-' : toArabicDigits(value)}
      </dd>
    </>
  );
}

// التمثيل العسكري voting card. On top, the officer info (facts on the right, portrait on the left);
// below it one row, right to left: the تصدق/لا يتصدق decision (commander/deputy), the score field,
// the (compact) بنود table, then the members' progress (commander/deputy).
// مسير الخدمة / لغة إنجليزية are computed and read-only.
export default function TamseelVotingScreen({
  officer, evalItems, isCommander, myVote, saving, voting, pendingVote, error,
  onSaveScores, onVote, tally, memberVotes, commanderName, header,
}: Props) {
  // Manual بند scores keyed by item_id, held as strings ('' = not entered); members type them in.
  const [scores, setScores] = useState<Record<number, string>>({});
  // The بند currently selected in the table — the الدرجة field beside it enters its degree.
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  // Re-initialise the member's picks from the server on two events: when the active officer changes,
  // and when the admin resets this member's evaluation (eval_state drops 1 -> 0 while the SAME officer
  // is shown). The latter stops a stale cached score from being re-saved after a «حذف تقييمات الأعضاء»
  // reset. Normal polling (eval_state unchanged) never clobbers the member's unsaved picks.
  const prevRef = useRef<{ oid: any; es: any }>({ oid: undefined, es: undefined });
  useEffect(() => {
    const oid = officer?.officer_id;
    const es = myVote?.eval_state;
    const officerChanged = prevRef.current.oid !== oid;
    const resetDetected = !officerChanged && prevRef.current.es === 1 && es === 0;
    if (officerChanged || resetDetected) {
      const init: Record<number, string> = {};
      const my = officer?.my_scores || {};
      for (const it of evalItems) {
        if (it.kind === 'computed') continue;
        const v = my[it.id];
        init[it.id] = v == null ? '' : String(v);
      }
      setScores(init);
      const firstManual = evalItems.find(it => it.kind !== 'computed');
      setSelectedItemId(firstManual ? firstManual.id : null);
    }
    prevRef.current = { oid, es };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officer?.officer_id, myVote?.eval_state]);

  const closed = officer?.done === 1;
  const serviceScore = officer?.service_score_pct != null ? Number(officer.service_score_pct) : null;
  const englishScore = officer?.english_score != null ? Number(officer.english_score) : null;

  // Admin-entered computed بنود resolve their value by source: لغة إنجليزية → english_score,
  // otherwise the officer's مسير الخدمة % (source=service_pct).
  const computedValue = (it: EvalItem): number | null =>
    it.source === 'english' ? englishScore : serviceScore;

  const scoreOf = (it: EvalItem): number => {
    if (it.kind === 'computed') return computedValue(it) ?? 0;
    const raw = scores[it.id];
    const n = raw == null || raw === '' ? 0 : Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const { sumScore, sumMax } = useMemo(() => {
    let s = 0, m = 0;
    for (const it of evalItems) { s += scoreOf(it); m += Number(it.max_degree) || 0; }
    return { sumScore: s, sumMax: m };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evalItems, scores, serviceScore, englishScore]);

  const average = sumMax > 0 ? Math.round((sumScore / sumMax) * 10000) / 100 : 0;

  // Members type the degree: select a بند, enter the number, and Enter moves on to the next بند so
  // scoring flows top-to-bottom.
  const manualItems = evalItems.filter(it => it.kind !== 'computed');
  const goToNextItem = (it: EvalItem) => {
    const i = manualItems.findIndex(x => x.id === it.id);
    const next = manualItems[i + 1];
    if (next) setSelectedItemId(next.id);
  };
  const setScore = (it: EvalItem, v: string) => setScores(prev => ({ ...prev, [it.id]: v }));
  const selectedManual = evalItems.find(it => it.id === selectedItemId && it.kind !== 'computed') || null;

  // Whole degrees from 1 to the بند's maximum only. Anything else is refused (the degree keeps its
  // last valid value) with a short message, so a score above the maximum can never be entered.
  const [scoreError, setScoreError] = useState('');
  const scoreInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!scoreError) return;
    const t = setTimeout(() => setScoreError(''), 2500);
    return () => clearTimeout(t);
  }, [scoreError]);
  // On a new بند, a focused field selects its text so the next number simply replaces it.
  useEffect(() => {
    setScoreError('');
    const el = scoreInputRef.current;
    if (el && document.activeElement === el) requestAnimationFrame(() => el.select());
  }, [selectedItemId]);

  const typeValue = (it: EvalItem, raw: string) => {
    const max = Math.floor(Number(it.max_degree) || 0);
    if (raw.trim() === '') {
      setScoreError('');
      setScore(it, '');
      return;
    }
    if (/[.,٫]/.test(raw)) { setScoreError('الدرجة عدد صحيح بدون كسور'); return; }
    const digits = toWesternDigits(raw).replace(/[^0-9]/g, '');
    if (!digits) { setScoreError('أدخل أرقاماً فقط'); return; }
    const n = Number(digits);
    if (n < 1) { setScoreError(`أقل درجة ${toArabicDigits(1)}`); return; }
    if (n > max) { setScoreError(`لا يمكن أن تتجاوز الدرجة ${toArabicDigits(max)}`); return; }
    setScoreError('');
    setScore(it, String(n));
  };

  const handleSave = () => {
    const payload = evalItems
      .filter(it => it.kind !== 'computed')
      .map(it => ({
        item_id: it.id,
        score: scores[it.id] === '' || scores[it.id] == null ? null : Number(scores[it.id]),
      }));
    onSaveScores(payload);
  };

  const opinion = myVote?.user_opinion;
  const akdam = [officer?.akdam_no != null ? officer.akdam_no : '', officer?.akdam_rep || '']
    .filter(String).join(' ');
  const kafaaAvg = officer?.kafaa_avg?.per == null
    ? ''
    : officer.kafaa_avg.grade
      ? `${officer.kafaa_avg.grade} (${officer.kafaa_avg.per}٪)`
      : `${officer.kafaa_avg.per}٪`;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-lg lg:h-full lg:min-h-0 lg:flex-1">
      {/* Officer info: the session bar and facts box on the right, the portrait on the left. */}
      <div className="shrink-0 flex gap-3 border-b border-slate-200 p-2">
        <div className="min-w-0 flex-1 flex flex-col gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2">
          {header && <div className="shrink-0 border-b border-slate-200 pb-2">{header}</div>}
          <div className="flex-1 grid content-center gap-x-10 gap-y-1 sm:grid-cols-2">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] content-start items-baseline gap-x-3 gap-y-1">
              <InfoField label="الأقدمية" value={akdam} />
              <InfoField label="الوظيفة" value={officer?.job_name} />
              <InfoField label="الوحدة" value={officer?.unit_name} />
              <InfoField label="التخصص" value={officer?.speciality} />
            </dl>
            {/* Each value sits right after its own label: these labels differ a lot in length, so a
                shared label column would leave a wide gap after the short ones (الاسم). */}
            <dl className="flex flex-col gap-y-1">
              <div className="flex items-baseline gap-3">
                <InfoField label="الاسم" value={[officer?.rank_name, officer?.officer_name].filter(Boolean).join(' / ')} />
              </div>
              {/* الطول، الوزن and التناسق belong together, so they share one line. التناسق (weight + 100 -
                  height) turns red at 15 or more — the fitness flag. */}
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
                {[
                  { label: 'الطول', value: officer?.height },
                  { label: 'الوزن', value: officer?.weight },
                  { label: 'التناسق', value: officer?.tanasok, warn: officer?.tanasok != null && officer.tanasok >= 15 },
                ].map(fact => (
                  <div key={fact.label} className="flex items-baseline gap-3">
                    <InfoField {...fact} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
                {[
                  { label: 'الحالة الاجتماعية', value: officer?.marital_status },
                  { label: 'عدد الأبناء', value: officer?.boy_no },
                  { label: 'عدد البنات', value: officer?.girl_no },
                ].map(fact => (
                  <div key={fact.label} className="flex items-baseline gap-3">
                    <InfoField {...fact} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
                {[
                  { label: 'متوسط تقارير الكفاءة', value: kafaaAvg },
                  { label: 'محل الإقامة', value: officer?.moh_n },
                ].map(fact => (
                  <div key={fact.label} className="flex items-baseline gap-3">
                    <InfoField {...fact} />
                  </div>
                ))}
              </div>
            </dl>
          </div>
        </div>
        {/* A 3:4 portrait frame, as tall as the room the session bar used to take; the photo covers it
            without stretching, cropped from the top so the face stays in view. Shorter on short
            screens (e.g. 1366×768) so the row below never scrolls. */}
        <OfficerPhoto officerId={officer.officer_id} className="aspect-[3/4] h-[14.5rem] shrink-0 [@media(min-height:900px)]:h-[18rem]" />
      </div>

      {error && (
        <div role="alert" className="shrink-0 m-3 rounded-lg border-2 border-red-700 bg-red-50 px-3 py-2 text-center text-xl font-bold text-red-900">
          {error}
        </div>
      )}

      {/* Body, one row on desktop (RTL, right to left): the commander's تصدق/لا يتصدق decision, the
          score picker, the بنود table, then the members' progress (commander only). The row is held
          to the body's height and a column that can't fit (a long members list) scrolls inside its
          own box, so the body itself never scrolls. Stacks on small screens with the table first. */}
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="p-3 flex flex-col gap-3 lg:h-full lg:flex-row lg:items-start">

          {/* بنود table (compact) + أعلى تأهيل */}
          <div className="min-w-0 space-y-2 lg:order-3 lg:flex-[2.4] lg:max-h-full lg:overflow-y-auto">
            {evalItems.length === 0 ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-4 text-center text-xl text-amber-800">
                لم تُحدَّد بنود التقييم لهذه اللجنة بعد.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-2xl border border-slate-200 rounded overflow-hidden">
                  <thead className="bg-slate-100 text-xl text-slate-600">
                    <tr>
                      <th className="text-right px-2 py-1">بند التقييم</th>
                      <th className="text-center px-2 py-1 whitespace-nowrap">الحد الأقصى</th>
                      <th className="text-center px-2 py-1 w-20">التقييم</th>
                      <th className="text-center px-2 py-1 w-20">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalItems.map(it => {
                      const computed = it.kind === 'computed';
                      const val = scoreOf(it);
                      return (
                        <tr key={it.id} className={`border-t border-slate-200 ${computed ? 'bg-emerald-50' : ''}`}>
                          <td className="px-2 py-1">
                        {it.name}
                          </td>
                          <td className="text-center px-2 py-1">{toArabicDigits(it.max_degree)}</td>
                          <td className="text-center px-2 py-1">
                            {computed ? (
                              <span className="font-bold text-emerald-700">
                                {computedValue(it) != null ? fmt(computedValue(it) as number) : '—'}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={closed || saving}
                                onClick={() => setSelectedItemId(it.id)}
                                className={`w-16 rounded border px-1 text-center font-bold bg-yellow-50 disabled:opacity-60 ${
                                  selectedItemId === it.id ? 'border-blue-500 ring-2 ring-blue-300' : 'border-slate-300'
                                }`}
                              >
                                {scores[it.id] ? toArabicDigits(scores[it.id]) : '—'}
                              </button>
                            )}
                          </td>
                          <td className="text-center px-2 py-1 text-slate-600">
                            {toArabicDigits(pctOf(val, Number(it.max_degree)))}٪
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="px-2 py-1">المجموع</td>
                      <td className="text-center px-2 py-1">{toArabicDigits(sumMax)}</td>
                      <td className="text-center px-2 py-1">{fmt(sumScore)}</td>
                      <td className="text-center px-2 py-1 text-blue-800">{toArabicDigits(average)}٪</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {(officer?.highest_tahil_mil || officer?.highest_tahil_civil) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {officer?.highest_tahil_mil && (
                  <div className="rounded-lg border border-slate-200 p-2 text-xl">
                    <div className="font-bold text-slate-500 mb-0.5">أعلى تأهيل عسكري</div>
                    <div>{toArabicDigits(officer.highest_tahil_mil)}</div>
                  </div>
                )}
                {officer?.highest_tahil_civil && (
                  <div className="rounded-lg border border-slate-200 p-2 text-xl">
                    <div className="font-bold text-slate-500 mb-0.5">أعلى تأهيل مدني</div>
                    <div>{toArabicDigits(officer.highest_tahil_civil)}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Score picker: متوسط + الدرجة + حفظ */}
          <div className="min-w-0 space-y-2 lg:order-2 lg:flex-[1.2] lg:max-h-full lg:overflow-y-auto">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-center">
              <div className="text-xl text-slate-600">متوسط التقييم النهائي</div>
              <div className="text-4xl font-bold text-blue-800">{toArabicDigits(average)}٪</div>
            </div>

            {!closed && selectedManual && (
              <div className="rounded-lg border border-slate-300 p-2">
                <div className="relative text-xl font-bold text-slate-900 mb-1 text-center">
                  {selectedManual.name}
                  <span className="text-slate-700"> (حد أقصى {toArabicDigits(selectedManual.max_degree)})</span>
                  {/* Covers the title, so the message never shifts the layout. */}
                  {scoreError && (
                    <p
                      id="manual-score-error"
                      role="alert"
                      className="absolute inset-x-0 top-0 z-10 flex min-h-full items-center justify-center rounded-lg bg-red-600 px-2 text-lg font-bold leading-tight text-white shadow-lg"
                    >
                      {scoreError}
                    </p>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <label htmlFor="manual-score" className="shrink-0 text-3xl font-bold text-slate-900">الدرجة</label>
                  <input
                    id="manual-score"
                    ref={scoreInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={saving}
                    value={toArabicDigits(scores[selectedManual.id] ?? '')}
                    onChange={e => typeValue(selectedManual, e.target.value)}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); goToNextItem(selectedManual); }
                    }}
                    aria-invalid={scoreError ? true : undefined}
                    aria-describedby={scoreError ? 'manual-score-error' : undefined}
                    className={`h-11 min-w-0 flex-1 rounded-lg border-2 bg-yellow-50 px-2 text-center text-3xl font-bold [@media(min-height:900px)]:h-12 text-slate-900 disabled:opacity-50 ${
                      scoreError ? 'border-red-600 ring-2 ring-red-200' : 'border-slate-300 focus:border-blue-500'
                    }`}
                  />
                </div>
              </div>
            )}
            {/* حفظ التقييم and مسح share one row; مسح clears only the selected بند. */}
            {!closed && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || evalItems.length === 0}
                  className="flex-[2] min-w-0 px-2 py-3 rounded-lg text-2xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'جارٍ الحفظ...' : 'حفظ التقييم'}
                </button>
                {selectedManual && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setScore(selectedManual, '')}
                    className="flex-1 min-w-0 px-2 py-3 rounded-lg text-2xl font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                  >
                    مسح
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Commander/deputy: تصدق/لا يتصدق decision */}
          {isCommander && (
            <div className="min-w-0 rounded-lg border border-slate-200 overflow-hidden lg:order-1 lg:flex-1">
              <div className="px-3 py-2 bg-amber-50 text-center text-xl font-bold text-amber-800">
                قرار {commanderName}
              </div>
              {closed ? (
                <p className="px-3 py-4 text-center text-xl font-bold text-gray-700 bg-gray-100">
                  تم إغلاق التقييم على هذا الضابط
                </p>
              ) : (
                <div className="px-3 py-3 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => onVote(1)}
                    disabled={voting}
                    className={`px-4 py-8 rounded-lg text-4xl font-bold text-white disabled:opacity-50 ${opinion === 1 ? 'bg-green-700 ring-2 ring-green-300' : 'bg-green-600'}`}
                  >
                    {pendingVote?.opinion === 1 ? '...' : 'تصدق'}{opinion === 1 ? ' ✓' : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => onVote(0)}
                    disabled={voting}
                    className={`px-4 py-8 rounded-lg text-4xl font-bold text-white disabled:opacity-50 ${opinion === 0 ? 'bg-red-700 ring-2 ring-red-300' : 'bg-red-600'}`}
                  >
                    {pendingVote?.opinion === 0 ? '...' : 'لا يتصدق'}{opinion === 0 ? ' ✓' : ''}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Commander/deputy: each member's scoring progress */}
          {isCommander && (
            <div className="min-w-0 flex flex-col rounded-lg border border-slate-200 overflow-hidden lg:order-4 lg:flex-1 lg:max-h-full">
              <div className="shrink-0 px-3 py-2 bg-slate-100 text-center text-xl font-bold text-slate-700">
                تقييمات أعضاء اللجنة
              </div>
              {tally && (
                <div className="shrink-0 px-3 pt-2 text-center text-xl text-slate-600">
                  أتمّ التقييم {toArabicDigits(tally.voted)} من {toArabicDigits(tally.total)} عضو
                </div>
              )}
              {memberVotes && memberVotes.length > 0 && (
                <div className="p-2 grid content-start gap-1 lg:min-h-0 lg:overflow-y-auto">
                  {memberVotes.map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-0.5 text-lg">
                      <span className="min-w-0 leading-tight">{m.name}</span>
                      <span className={`shrink-0 ${m.voted ? 'text-green-700 font-bold' : 'text-slate-400'}`}>
                        {m.voted ? 'أتمّ' : 'بانتظار'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
