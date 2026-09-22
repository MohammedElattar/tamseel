import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getStatistics } from '../../../api/committees';
import ReportPage from '../../../components/reports/ReportPage';
import { toArabicDigits, formatDate } from '../../../utils/format';
import { useLiveUpdates } from '../../../hooks/useLiveUpdates';

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export default function StatisticsReport() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    () => getStatistics(Number(id)).then(setData).finally(() => setLoading(false)),
    [id]
  );
  useEffect(() => { fetchData(); }, [fetchData]);
  useLiveUpdates(fetchData);

  const committee = data?.committee;

  return (
    <ReportPage loading={loading}>
      <div className="px-10 py-8">
        <h1 className="text-center text-2xl font-bold underline mb-2" style={{ color: 'rgb(0,0,128)' }}>
          إحصائيات اللجنة
        </h1>
        {committee && (
          <div className="text-center text-sm mb-6">
            {committee.lagna_cat_name || ''}
            {committee.lagna_date ? <> — بتاريخ {formatDate(committee.lagna_date)}</> : null}
          </div>
        )}
        {!data ? null : <TagddedStats data={data} />}
      </div>
    </ReportPage>
  );
}

function TagddedStats({ data }: { data: any }) {
  const total = data.total || 0;
  const cards = [
    { label: 'إجمالي الضباط', value: total, pct: null as number | null },
    { label: 'يستمر / يجدد', value: data.cont, pct: pct(data.cont, total) },
    { label: 'يحال / لا يجدد', value: data.refer, pct: pct(data.refer, total) },
    { label: 'لم تعقد', value: data.undecided, pct: pct(data.undecided, total) },
  ];
  return (
    <>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {cards.map(c => (
          <div key={c.label} className="border border-gray-400 rounded p-3 text-center">
            <div className="text-2xl font-bold">{toArabicDigits(c.value ?? 0)}</div>
            <div className="text-sm text-gray-600">{c.label}</div>
            {c.pct != null && <div className="text-xs text-gray-500">{toArabicDigits(c.pct)}%</div>}
          </div>
        ))}
      </div>

      <table className="w-full text-sm border border-gray-400 border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-2 py-1">نوع الترقية</th>
            <th className="border border-gray-400 px-2 py-1">الإجمالي</th>
            <th className="border border-gray-400 px-2 py-1">يستمر</th>
            <th className="border border-gray-400 px-2 py-1">يحال</th>
            <th className="border border-gray-400 px-2 py-1">لم تعقد</th>
          </tr>
        </thead>
        <tbody>
          {(data.byType || []).map((g: any) => (
            <tr key={g.taraky_n}>
              <td className="border border-gray-400 px-2 py-1">{toArabicDigits(g.taraky_n)}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{toArabicDigits(g.total)}</td>
              <td className="border border-gray-400 px-2 py-1 text-center text-green-700">{toArabicDigits(g.cont)}</td>
              <td className="border border-gray-400 px-2 py-1 text-center text-red-700">{toArabicDigits(g.refer)}</td>
              <td className="border border-gray-400 px-2 py-1 text-center text-gray-500">{toArabicDigits(g.undecided)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

