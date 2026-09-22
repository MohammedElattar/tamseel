import { useState, useEffect, useMemo, useRef } from 'react';
import { toArabicDigits } from '../../utils/format';

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
  total: number;
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
}

const pctOf = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) : 0);
const fmt = (n: number) => toArabicDigits(Number.isInteger(n) ? String(n) : n.toFixed(2));

// Pickable degrees for a بند (the legacy tile grid): every integer for the top 6 (max-5..max) plus
// steps of 5 below. e.g. max 20 -> ٥,١٠,١٥,١٦,١٧,١٨,١٩,٢٠. Centralised so the set is easy to adjust.
const allowedValues = (max: number): number[] => {
  const m = Math.floor(Number(max) || 0);
  if (m <= 0) return [];
  const set = new Set<number>();
  for (let v = 5; v <= m; v += 5) set.add(v);
  for (let v = Math.max(1, m - 5); v <= m; v++) set.add(v);
  return Array.from(set).sort((a, b) => a - b);
};

// التمثيل العسكري voting card. Layout: score tile picker on the right, the (compact) بنود table in
// the middle, and — for the commander/deputy — the تصدق/لا يتصدق decision + members' progress on the
// left. مسير الخدمة / لغة إنجليزية are computed and read-only.
export default function TamseelVotingScreen({
  officer, evalItems, total, isCommander, myVote, saving, voting, pendingVote, error,
  onSaveScores, onVote, tally, memberVotes, commanderName,
}: Props) {
  // Manual بند scores keyed by item_id, held as strings ('' = not picked); members pick from a tile grid.
  const [scores, setScores] = useState<Record<number, string>>({});
  // The بند currently selected in the grid — its tile picker shows on the side.
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

  // Members pick the degree from a tile grid (matching the legacy card): select a بند, then tap a
  // number. After a pick we auto-advance to the next بند so scoring flows top-to-bottom.
  const manualItems = evalItems.filter(it => it.kind !== 'computed');
  const pickValue = (it: EvalItem, v: number | null) => {
    setScores(prev => ({ ...prev, [it.id]: v == null ? '' : String(v) }));
    if (v != null) {
      const i = manualItems.findIndex(x => x.id === it.id);
      const next = manualItems[i + 1];
      if (next) setSelectedItemId(next.id);
    }
  };
  const selectedManual = evalItems.find(it => it.id === selectedItemId && it.kind !== 'computed') || null;

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

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-lg lg:h-full lg:min-h-0 lg:flex-1">
      {/* Header banner: the target post (لشغل وظيفة) then the officer identity. */}
      <div className="shrink-0 bg-rose-50 border-b-2 border-rose-200 px-4 py-2 text-center">
        <b className="text-rose-800 text-lg">
          لشغل وظيفة{officer?.target_job ? ` (${officer.target_job})` : ''}
        </b>
      </div>
      <div className="shrink-0 px-4 py-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm border-b border-slate-200">
        {akdam && <span className="font-bold text-blue-900">{toArabicDigits(akdam)}</span>}
        <span>{[officer?.rank_name, officer?.officer_name].filter(Boolean).join(' / ')}</span>
        {officer?.serial != null && (
          <span className="text-slate-500">الترتيب: {toArabicDigits(officer.serial)} / {toArabicDigits(total)}</span>
        )}
      </div>

      {error && (
        <div role="alert" className="shrink-0 m-3 rounded-lg border-2 border-red-700 bg-red-50 px-3 py-2 text-center text-base font-bold text-red-900">
          {error}
        </div>
      )}

      {/* Scrollable body: score picker (right), بنود table (middle), commander decision + members'
          progress (left). Stacks on small screens with the table first. */}
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className={`p-3 grid gap-3 ${isCommander ? 'lg:grid-cols-[15rem_minmax(0,1fr)_17rem]' : 'lg:grid-cols-[15rem_minmax(0,1fr)]'}`}>

          {/* بنود table (compact) + أعلى تأهيل — middle on desktop, first on mobile */}
          <div className="min-w-0 space-y-2 order-1 lg:order-2">
            {evalItems.length === 0 ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-4 text-center text-sm text-amber-800">
                لم تُحدَّد بنود التقييم لهذه اللجنة بعد.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-200 rounded overflow-hidden">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="text-right px-2 py-1">بند التقييم</th>
                      <th className="text-center px-2 py-1 w-14">الحد الأقصى</th>
                      <th className="text-center px-2 py-1 w-16">التقييم</th>
                      <th className="text-center px-2 py-1 w-12">%</th>
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
                                className={`w-14 rounded border px-1 py-0.5 text-center font-bold bg-yellow-50 disabled:opacity-60 ${
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
                  <div className="rounded-lg border border-slate-200 p-2 text-xs">
                    <div className="font-bold text-slate-500 mb-0.5">أعلى تأهيل عسكري</div>
                    <div>{officer.highest_tahil_mil}</div>
                  </div>
                )}
                {officer?.highest_tahil_civil && (
                  <div className="rounded-lg border border-slate-200 p-2 text-xs">
                    <div className="font-bold text-slate-500 mb-0.5">أعلى تأهيل مدني</div>
                    <div>{officer.highest_tahil_civil}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Score picker (right): متوسط + tile grid + حفظ */}
          <div className="space-y-3 order-2 lg:order-1">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-center">
              <div className="text-xs text-slate-600">متوسط التقييم النهائي</div>
              <div className="text-2xl font-bold text-blue-800">{toArabicDigits(average)}٪</div>
            </div>

            {!closed && selectedManual && (
              <div className="rounded-lg border border-slate-300 p-2">
                <div className="text-xs font-bold text-slate-600 mb-1 text-center">
                  {selectedManual.name}
                  <span className="text-slate-400"> (حد أقصى {toArabicDigits(selectedManual.max_degree)})</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {allowedValues(Number(selectedManual.max_degree)).map(v => {
                    const active = String(v) === (scores[selectedManual.id] ?? '');
                    return (
                      <button
                        key={v}
                        type="button"
                        disabled={saving}
                        onClick={() => pickValue(selectedManual, v)}
                        className={`aspect-square flex items-center justify-center rounded text-lg font-bold border disabled:opacity-50 ${
                          active ? 'bg-blue-600 text-white border-blue-700' : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-800'
                        }`}
                      >
                        {toArabicDigits(v)}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => pickValue(selectedManual, null)}
                  className="w-full mt-1 py-1 rounded text-xs border border-slate-300 text-slate-500 hover:bg-slate-100"
                >
                  مسح
                </button>
              </div>
            )}
            {!closed && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || evalItems.length === 0}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-50"
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ التقييم'}
              </button>
            )}
          </div>

          {/* Commander/deputy (left): تصدق/لا يتصدق decision + members' progress */}
          {isCommander && (
            <div className="rounded-lg border border-slate-200 overflow-hidden self-start order-3 lg:order-3">
              <div className="px-3 py-1.5 bg-amber-50 text-center text-xs font-bold text-amber-800">
                قرار {commanderName}
              </div>
              {closed ? (
                <p className="px-3 py-4 text-center text-base font-bold text-gray-700 bg-gray-100">
                  تم إغلاق التقييم على هذا الضابط
                </p>
              ) : (
                <div className="px-3 py-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onVote(1)}
                    disabled={voting}
                    className={`px-4 py-2 rounded-lg font-bold text-white disabled:opacity-50 ${opinion === 1 ? 'bg-green-700 ring-2 ring-green-300' : 'bg-green-600'}`}
                  >
                    {pendingVote?.opinion === 1 ? '...' : 'تصدق'}{opinion === 1 ? ' ✓' : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => onVote(0)}
                    disabled={voting}
                    className={`px-4 py-2 rounded-lg font-bold text-white disabled:opacity-50 ${opinion === 0 ? 'bg-red-700 ring-2 ring-red-300' : 'bg-red-600'}`}
                  >
                    {pendingVote?.opinion === 0 ? '...' : 'لا يتصدق'}{opinion === 0 ? ' ✓' : ''}
                  </button>
                </div>
              )}
              {tally && (
                <div className="px-3 pb-2 text-center text-xs text-slate-600">
                  أتمّ التقييم {toArabicDigits(tally.voted)} من {toArabicDigits(tally.total)} عضو
                </div>
              )}
              {memberVotes && memberVotes.length > 0 && (
                <div className="px-3 pb-3 grid gap-1">
                  {memberVotes.map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-xs">
                      <span className="truncate">{m.name}</span>
                      <span className={m.voted ? 'text-green-700 font-bold' : 'text-slate-400'}>
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
