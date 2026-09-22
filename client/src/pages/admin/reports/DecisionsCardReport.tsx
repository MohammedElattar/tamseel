import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getDecisions } from '../../../api/committees';
import ReportPage from '../../../components/reports/ReportPage';
import { toArabicDigits } from '../../../utils/format';
import { useLiveUpdates } from '../../../hooks/useLiveUpdates';

// Committee level (committees.tamhidy) -> footer decision label.
const LEVEL_LABEL: Record<number, string> = { 0: 'الرئيسية', 1: 'التمهيدية', 2: 'القائد' };

// Legacy member row order on the card (LAGNA_DECISIONS matrix); others fall to serial.
const SLOT_ORDER = ['EVAL1', 'EVAL13', 'EVAL2', 'EVAL3', 'EVAL8', 'EVAL6', 'EVAL4', 'EVAL5', 'EVAL10', 'EVAL7', 'EVAL9'];

export default function DecisionsCardReport() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    return getDecisions(Number(id)).then(setData).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useLiveUpdates(fetchData);

  const committee = data?.committee;

  return (
    <ReportPage loading={loading}>
      <TagddedCards committee={committee} officers={data?.officers || []}
        members={data?.members || []} levelVotes={data?.levelVotes} />
    </ReportPage>
  );
}

function TagddedCards({ committee, officers, members, levelVotes }: {
  committee: any; officers: any[]; members: any[]; levelVotes: any;
}) {
  const buildMap = (arr: any[]) => {
    const m: Record<number, Record<number, number>> = {};
    for (const v of (arr || [])) (m[v.officer_id] ||= {})[v.user_id] = v.user_opinion;
    return m;
  };
  const byCommander = buildMap(levelVotes?.commander);
  const byPrelim = buildMap(levelVotes?.prelim);
  const byMain = buildMap(levelVotes?.main);
  const level = Number(committee?.tamhidy) || 0; // for the footer decision label
  const token = localStorage.getItem('edara_token') || '';

  const rank = (u: string) => { const i = SLOT_ORDER.indexOf(u); return i === -1 ? 999 : i; };
  const orderedMembers = [...members].sort(
    (a, b) => rank(a.username) - rank(b.username) || (a.serial - b.serial)
  );
  const mark = (op: number | undefined) =>
    op === 1 ? <span style={{ color: 'rgb(0,120,0)' }}>يستمر</span>
      : op === 0 ? <span style={{ color: 'rgb(200,0,0)' }}>يحال</span>
        : op === -1 ? <span style={{ color: 'rgb(200,110,0)' }}>يؤجل</span> : '';

  return (
    <div className="px-4 py-4">
      <div className="grid grid-cols-2 gap-3">
        {officers.map((o) => (
          <div
            key={o.officer_id}
            className="border-2 border-gray-700 p-2 text-[11px] flex flex-col"
            style={{ breakInside: 'avoid', minHeight: '8.8cm' }}
          >
            <div className="flex items-start justify-between mb-1 gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-bold underline text-sm mb-1" style={{ color: 'rgb(0,0,128)' }}>{toArabicDigits(o.taraky_n || '')}</div>
                <div className="font-bold">{toArabicDigits([o.rank_name, o.officer_name].filter(Boolean).join(' / '))}</div>
                <div className="text-gray-700">أقدمية: {[toArabicDigits(o.akdam_no ?? ''), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}</div>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-14 h-16 border border-gray-400 bg-gray-50 overflow-hidden">
                  <img
                    src={`/api/officers/${o.officer_id}/photo?token=${encodeURIComponent(token)}`}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
                {o.dispute === 1 && (
                  <span className="px-1 rounded text-white text-[10px] font-bold" style={{ background: 'rgb(200,40,0)' }}>خلاف</span>
                )}
              </div>
            </div>

            <table className="w-full border border-gray-500 border-collapse text-[10px] flex-1">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-500 px-1">م</th>
                  <th className="border border-gray-500 px-1 text-right">العضو</th>
                  <th className="border border-gray-500 px-1">لجنة القائد</th>
                  <th className="border border-gray-500 px-1">التمهيدية</th>
                  <th className="border border-gray-500 px-1">الرئيسية</th>
                </tr>
              </thead>
              <tbody>
                {orderedMembers.map((m, i) => (
                  <tr key={m.user_id}>
                    <td className="border border-gray-500 px-1 text-center">{toArabicDigits(i + 1)}</td>
                    <td className="border border-gray-500 px-1 whitespace-nowrap">
                      السيد / {toArabicDigits(m.job_title || [m.rank_snapshot, m.name_snapshot].filter(Boolean).join(' / '))}
                    </td>
                    <td className="border border-gray-500 px-1 text-center font-bold">{mark(byCommander[o.officer_id]?.[m.user_id])}</td>
                    <td className="border border-gray-500 px-1 text-center font-bold">{mark(byPrelim[o.officer_id]?.[m.user_id])}</td>
                    <td className="border border-gray-500 px-1 text-center font-bold">{mark(byMain[o.officer_id]?.[m.user_id])}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between items-center mt-1 font-bold">
              <span>رقم الصفحة: {toArabicDigits(o.serial)}</span>
              <span>قرار اللجنة {LEVEL_LABEL[level] || 'الرئيسية'}: {toArabicDigits(o.decision) || 'لم تعقد'}</span>
            </div>
          </div>
        ))}
      </div>
      {!officers.length && <div className="text-center text-gray-400 py-10">لا يوجد ضباط</div>}
    </div>
  );
}
