import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { getCommittee } from '../../api/committees';
import { getVotingStatus, getOfficerMemberScores, saveOfficerReview } from '../../api/evaluations';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { toArabicDigits, toWesternDigits } from '../../utils/format';

const fmt = (v: any) =>
  v == null ? '—' : toArabicDigits(Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1));

const tawsyaLabel = (v: any) =>
  Number(v) === 0 ? 'يوصى بالإحالة' : Number(v) === 1 ? 'لا يوصى بالإحالة' : '—';

// موقف/مراجعة تقييم أعضاء اللجنة: matrix of every included member's بند scores for one officer, with
// the computed بنود (مسير الخدمة % + لغة إنجليزية) shown once, each member's total/نسبة and averages.
// Read-only (موقف) by default; «تعديل» switches to مراجعة where the admin overrides members' manual
// scores and sets the officer's final evaluation + توصية. Live refresh pauses while editing.
export default function MemberScoresMatrix() {
  const { id } = useParams<{ id: string }>();
  const committeeId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();

  const [committee, setCommittee] = useState<any>(null);
  const [officers, setOfficers] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Edit (مراجعة) state.
  const [editMode, setEditMode] = useState(false);
  const [editScores, setEditScores] = useState<Record<string, string>>({}); // `${user_id}:${item_id}` -> string
  const [editFinal, setEditFinal] = useState('');   // '', '1', '2', '-1'
  const [editTawsya, setEditTawsya] = useState('');  // '', '0', '1'
  const [saving, setSaving] = useState(false);
  const editingRef = useRef(false);
  useEffect(() => { editingRef.current = editMode; }, [editMode]);

  const loadList = useCallback(() => {
    return Promise.all([getCommittee(committeeId), getVotingStatus(committeeId)])
      .then(([c, s]) => { setCommittee(c.committee); setOfficers(s); return s as any[]; })
      .catch((e) => { setError(e.response?.data?.error || 'تعذر تحميل البيانات'); return [] as any[]; });
  }, [committeeId]);

  useEffect(() => {
    loadList().then((s) => {
      const q = Number(searchParams.get('officer'));
      const initial = Number.isInteger(q) && q
        ? q
        : (s.find((o) => o.is_active === 1)?.officer_id ?? s[0]?.officer_id ?? null);
      setSelectedId(initial ?? null);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadList]);

  const loadMatrix = useCallback(() => {
    if (!selectedId) { setData(null); return Promise.resolve(); }
    return getOfficerMemberScores(committeeId, selectedId)
      .then(setData)
      .catch((e) => setError(e.response?.data?.error || 'تعذر تحميل التقييمات'));
  }, [committeeId, selectedId]);

  useEffect(() => { loadMatrix(); }, [loadMatrix]);
  // Live refresh both the list and the matrix — but never while the admin is editing.
  useLiveUpdates(useCallback(() => {
    if (editingRef.current) return;
    loadList(); loadMatrix();
  }, [loadList, loadMatrix]));

  const select = (officerId: number) => {
    if (editMode) return;
    setSelectedId(officerId);
    setSearchParams((p) => { p.set('officer', String(officerId)); return p; }, { replace: true });
  };

  const idx = useMemo(() => officers.findIndex((o) => o.officer_id === selectedId), [officers, selectedId]);
  const go = (delta: number) => {
    const n = idx + delta;
    if (n >= 0 && n < officers.length) select(officers[n].officer_id);
  };

  const items: any[] = data?.items || [];
  const members: any[] = data?.members || [];
  const off = data?.officer;
  const avg = data?.averages || { items: {}, total: null, overall_pct: null };
  const totalMax = data?.total_max ?? 0;
  const colCount = items.length + 5;

  const startEdit = () => {
    const init: Record<string, string> = {};
    for (const m of members) for (const it of items) {
      if (it.kind === 'computed') continue;
      const v = m.scores[it.id];
      init[`${m.user_id}:${it.id}`] = v == null ? '' : String(v);
    }
    setEditScores(init);
    setEditFinal(off?.final_eval != null && off.final_eval !== '' ? String(Number(off.final_eval)) : '');
    setEditTawsya(off?.kaed_tawsya != null ? String(Number(off.kaed_tawsya)) : '');
    setMsg('');
    setEditMode(true);
  };

  const setCell = (userId: number, it: any, val: string) => {
    let west = toWesternDigits(val).replace(/[^0-9.]/g, '');
    if (west !== '' && Number(west) > Number(it.max_degree)) west = String(it.max_degree);
    setEditScores((prev) => ({ ...prev, [`${userId}:${it.id}`]: west }));
  };

  // Live per-row recompute while editing (computed بنود keep their stored value).
  const editedTotal = (m: any) => {
    let total = 0;
    for (const it of items) {
      if (it.kind === 'computed') { total += Number(m.scores[it.id]) || 0; continue; }
      const raw = editScores[`${m.user_id}:${it.id}`];
      total += raw === '' || raw == null ? 0 : (Number(raw) || 0);
    }
    return total;
  };
  const editedPct = (m: any) => (totalMax > 0 ? Math.round((editedTotal(m) / totalMax) * 1000) / 10 : 0);

  const save = async () => {
    if (!selectedId) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const scores: { user_id: number; item_id: number; score: number | null }[] = [];
      for (const m of members) for (const it of items) {
        if (it.kind === 'computed') continue;
        const raw = editScores[`${m.user_id}:${it.id}`];
        scores.push({ user_id: m.user_id, item_id: it.id, score: raw === '' || raw == null ? null : Number(raw) });
      }
      await saveOfficerReview(committeeId, selectedId, {
        scores,
        final_eval: editFinal === '' ? null : Number(editFinal),
        kaed_tawsya: editTawsya === '' ? null : Number(editTawsya),
      });
      setEditMode(false);
      setMsg('تم حفظ المراجعة');
      await loadMatrix();
      await loadList();
    } catch (e: any) {
      setError(e.response?.data?.error || 'تعذر حفظ المراجعة');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;
  if (!committee) return <div className="card text-center py-10 text-gray-400">اللجنة غير موجودة</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="page-title mb-0">{editMode ? 'مراجعة تقييم أعضاء اللجنة' : 'موقف تقييم الأعضاء'}</h2>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${committee.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {committee.is_active ? 'الجلسة نشطة' : 'الجلسة متوقفة'}
          </span>
          {!editMode && (
            <Link to={`/print/committee/${id}/member-scores-card`} target="_blank" className="btn-secondary text-sm">طباعة البطاقة</Link>
          )}
          <Link to={`/admin/committees/${id}`} className="btn-secondary text-sm">العودة للتفاصيل</Link>
        </div>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-3">{msg}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>}

      {/* Officer picker + prev/next (disabled while editing) */}
      <div className="card mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => go(-1)} disabled={editMode || idx <= 0} className="btn-secondary text-sm disabled:opacity-40">◄ السابق</button>
        <select
          value={selectedId ?? ''}
          onChange={(e) => select(Number(e.target.value))}
          disabled={editMode}
          className="input-field flex-1 min-w-[16rem] disabled:opacity-60"
        >
          {officers.map((o) => (
            <option key={o.officer_id} value={o.officer_id}>
              {toArabicDigits(o.serial)} - {[o.rank_name, o.officer_name].filter(Boolean).join(' / ')}{o.done === 1 ? ' (تم)' : ''}
            </option>
          ))}
        </select>
        <button onClick={() => go(1)} disabled={editMode || idx < 0 || idx >= officers.length - 1} className="btn-secondary text-sm disabled:opacity-40">التالي ►</button>
      </div>

      {!off ? (
        <div className="card text-center py-10 text-gray-400">لا يوجد ضباط في اللجنة</div>
      ) : (
        <>
          {/* Officer header */}
          <div className="card mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xl font-bold">{toArabicDigits([off.rank_name, off.officer_name].filter(Boolean).join(' / '))}</div>
                <div className="text-sm text-gray-500">
                  م {toArabicDigits(off.serial)}
                  {off.target_job ? ` — لشغل وظيفة: ${toArabicDigits(off.target_job)}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
                  <span className="text-gray-500">مسير الخدمة: </span>
                  <b className="text-emerald-700">{off.service_score_pct != null ? fmt(off.service_score_pct) + '٪' : '—'}</b>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
                  <span className="text-gray-500">لغة إنجليزية: </span>
                  <b className="text-emerald-700">{off.english_score != null ? fmt(off.english_score) : '—'}</b>
                </div>

                {editMode ? (
                  <>
                    <label className="text-gray-500">التقييم النهائي</label>
                    <select value={editFinal} onChange={(e) => setEditFinal(e.target.value)} className="input-field py-1 w-32">
                      <option value="">— بدون —</option>
                      <option value="1">تصدق</option>
                      <option value="2">لا يتصدق</option>
                      <option value="-1">يؤجل</option>
                    </select>
                    <label className="text-gray-500">التوصية</label>
                    <select value={editTawsya} onChange={(e) => setEditTawsya(e.target.value)} className="input-field py-1 w-40">
                      <option value="">— بدون —</option>
                      <option value="0">يوصى بالإحالة</option>
                      <option value="1">لا يوصى بالإحالة</option>
                    </select>
                    <button onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                      {saving ? 'جارٍ الحفظ...' : 'حفظ'}
                    </button>
                    <button onClick={() => setEditMode(false)} disabled={saving} className="btn-secondary text-sm">إلغاء</button>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
                      <span className="text-gray-500">التقييم النهائي: </span>
                      <b className="text-blue-800">{off.decision || '—'}</b>
                    </div>
                    <div className="rounded-lg border border-gray-200 px-3 py-1.5">
                      <span className="text-gray-500">التوصية: </span>
                      <b>{tawsyaLabel(off.kaed_tawsya)}</b>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${off.done === 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {off.done === 1 ? 'مغلق' : 'مفتوح'}
                    </span>
                    <button onClick={startEdit} className="btn-primary text-sm">تعديل التقييمات</button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Matrix */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="p-2">م</th>
                  <th className="p-2">العضو</th>
                  {items.map((it) => (
                    <th key={it.id} className="p-2 text-center">
                      {it.name}
                      <span className="block text-[10px] font-normal text-gray-400">
                        {toArabicDigits(it.max_degree)}
                      </span>
                    </th>
                  ))}
                  <th className="p-2 text-center">المجموع</th>
                  <th className="p-2 text-center">النسبة</th>
                  <th className="p-2 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-b">
                    <td className="p-2">{toArabicDigits(m.serial)}</td>
                    <td className="p-2 font-medium">{toArabicDigits([m.rank_name, m.name].filter(Boolean).join(' / '))}</td>
                    {items.map((it) => (
                      <td key={it.id} className={`p-2 text-center ${it.kind === 'computed' ? 'bg-emerald-50 text-emerald-700 font-medium' : ''}`}>
                        {editMode && it.kind !== 'computed' ? (
                          <input
                            inputMode="numeric"
                            value={toArabicDigits(editScores[`${m.user_id}:${it.id}`] ?? '')}
                            onChange={(e) => setCell(m.user_id, it, e.target.value)}
                            className="w-16 rounded border border-slate-300 px-1 py-0.5 text-center bg-yellow-50"
                            placeholder="—"
                          />
                        ) : fmt(m.scores[it.id])}
                      </td>
                    ))}
                    <td className="p-2 text-center font-semibold">{fmt(editMode ? editedTotal(m) : m.total)}</td>
                    <td className="p-2 text-center font-bold text-blue-800">{fmt(editMode ? editedPct(m) : m.pct)}٪</td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${m.voted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.voted ? 'أتمّ' : 'بانتظار'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!members.length && (
                  <tr><td colSpan={colCount} className="p-4 text-center text-gray-400">لا يوجد أعضاء في اللجنة</td></tr>
                )}
                {members.length > 0 && !editMode && (
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                    <td className="p-2" colSpan={2}>المتوسط (لمن أتمّ التقييم)</td>
                    {items.map((it) => (
                      <td key={it.id} className="p-2 text-center">{fmt(avg.items?.[it.id])}</td>
                    ))}
                    <td className="p-2 text-center">{fmt(avg.total)}</td>
                    <td className="p-2 text-center text-blue-800">{avg.overall_pct != null ? fmt(avg.overall_pct) + '٪' : '—'}</td>
                    <td className="p-2" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
