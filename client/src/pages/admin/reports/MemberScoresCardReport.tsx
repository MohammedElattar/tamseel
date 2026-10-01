import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getMemberScoresReport } from '../../../api/committees';
import ReportPage from '../../../components/reports/ReportPage';
import { toArabicDigits, formatDate } from '../../../utils/format';

const fmt = (v: any) =>
  v == null ? '—' : toArabicDigits(Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1));
// بطاقة تقييم أعضاء اللجنة (printable): one card per officer — the members×بنود score matrix with the
// computed بنود (مسير الخدمة % + لغة إنجليزية), each member's total/نسبة, the averages, and the final
// evaluation. Mirrors the موقف/مراجعة screen, formatted as an official filable document.
export default function MemberScoresCardReport() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    return getMemberScoresReport(Number(id)).then(setData).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const committee = data?.committee;
  const items: any[] = data?.items || [];
  const officers: any[] = data?.officers || [];

  return (
    <ReportPage loading={loading}>
      <div className="px-4 py-4">
        <div className="text-center mb-4">
          <h1 className="text-lg font-bold">بطاقة تقييم أعضاء اللجنة</h1>
          <div className="text-sm text-gray-700">
            {toArabicDigits(committee?.lagna_cat_name || '')}
            {committee?.training_year ? ` — العام التدريبي ${toArabicDigits(committee.training_year)}` : ''}
            {committee?.lagna_date ? ` — بداية اللجنة ${formatDate(committee.lagna_date)}` : ''}
          </div>
        </div>

        {officers.map((o) => (
          <div
            key={o.officer_id}
            className="border-2 border-gray-700 p-2 mb-3 text-[11px]"
            style={{ breakInside: 'avoid' }}
          >
            {/* Officer header */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <div className="font-bold text-sm">{toArabicDigits([o.rank_name, o.officer_name].filter(Boolean).join(' / '))}</div>
                <div className="text-gray-700">
                  م {toArabicDigits(o.serial)}
                  {' — '}أقدمية {[toArabicDigits(o.akdam_no ?? ''), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}
                  {o.target_job ? ` — لشغل وظيفة: ${toArabicDigits(o.target_job)}` : ''}
                </div>
              </div>
              <div className="text-left shrink-0 space-y-0.5 whitespace-nowrap">
                <div>مسير الخدمة: <b>{o.service_score_pct != null ? fmt(o.service_score_pct) + '٪' : '—'}</b></div>
                <div>لغة إنجليزية: <b>{o.english_score != null ? fmt(o.english_score) : '—'}</b></div>
              </div>
            </div>

            <table className="w-full border border-gray-500 border-collapse text-[9px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-500 px-1">م</th>
                  <th className="border border-gray-500 px-1 text-right">العضو</th>
                  {items.map((it) => (
                    <th key={it.id} className="border border-gray-500 px-0.5 text-center align-bottom" style={{ minWidth: '1.3cm' }}>
                      <div className="whitespace-normal leading-tight">{it.name}</div>
                      <div className="text-[8px] text-gray-500 font-normal">{toArabicDigits(it.max_degree)}</div>
                    </th>
                  ))}
                  <th className="border border-gray-500 px-1">المجموع</th>
                  <th className="border border-gray-500 px-1">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {o.members.map((m: any, i: number) => (
                  <tr key={m.user_id}>
                    <td className="border border-gray-500 px-1 text-center">{toArabicDigits(i + 1)}</td>
                    <td className="border border-gray-500 px-1 whitespace-nowrap">{toArabicDigits([m.rank_name, m.name].filter(Boolean).join(' / '))}</td>
                    {items.map((it) => (
                      <td key={it.id} className={`border border-gray-500 px-0.5 text-center ${it.kind === 'computed' ? 'bg-gray-50' : ''}`}>
                        {fmt(m.scores[it.id])}
                      </td>
                    ))}
                    <td className="border border-gray-500 px-1 text-center font-bold">{fmt(m.total)}</td>
                    <td className="border border-gray-500 px-1 text-center font-bold">{fmt(m.pct)}٪</td>
                  </tr>
                ))}
                {!o.members.length && (
                  <tr><td colSpan={items.length + 4} className="border border-gray-500 px-1 text-center text-gray-400 py-2">لا يوجد أعضاء</td></tr>
                )}
                <tr className="bg-gray-100 font-bold">
                  <td className="border border-gray-500 px-1 text-center" colSpan={2}>المتوسط</td>
                  {items.map((it) => (
                    <td key={it.id} className="border border-gray-500 px-0.5 text-center">{fmt(o.averages?.items?.[it.id])}</td>
                  ))}
                  <td className="border border-gray-500 px-1 text-center">{fmt(o.averages?.total)}</td>
                  <td className="border border-gray-500 px-1 text-center">{o.averages?.overall_pct != null ? fmt(o.averages.overall_pct) + '٪' : '—'}</td>
                </tr>
              </tbody>
            </table>

            <div className="flex justify-end items-center mt-1 font-bold text-[11px]">
              <span>التقييم النهائي: {toArabicDigits(o.decision) || 'لم يُحدد'}</span>
            </div>
          </div>
        ))}
        {!officers.length && <div className="text-center text-gray-400 py-10">لا يوجد ضباط</div>}
      </div>
    </ReportPage>
  );
}
