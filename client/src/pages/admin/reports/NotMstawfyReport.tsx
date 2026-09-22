import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getNotMstawfy } from '../../../api/committees';
import ReportPage from '../../../components/reports/ReportPage';
import { toArabicDigits, formatDate } from '../../../utils/format';
import { useLiveUpdates } from '../../../hooks/useLiveUpdates';

export default function NotMstawfyReport() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(() => {
    return getNotMstawfy(Number(id)).then(setData).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { fetchReport(); }, [fetchReport]);
  useLiveUpdates(fetchReport);

  const committee = data?.committee;
  const officers: any[] = data?.officers || [];

  const groups: { name: string; rows: any[] }[] = [];
  for (const o of officers) {
    const name = o.taraky_n || 'غير محدد';
    let g = groups.find(x => x.name === name);
    if (!g) { g = { name, rows: [] }; groups.push(g); }
    g.rows.push(o);
  }

  return (
    <ReportPage loading={loading}>
      <div className="px-10 py-8" style={{ minHeight: '29.7cm' }}>
        <h1 className="text-center text-2xl font-bold underline mb-6" style={{ color: 'rgb(0,0,128)' }}>
          الضباط الغير مستوفى بالنشرة وتم استمرارهم
        </h1>
        {committee && (
          <div className="text-center mb-6 font-bold">
            {committee.lagna_cat_name || ''}
            {committee.lagna_date ? <> — بتاريخ {formatDate(committee.lagna_date)}</> : null}
          </div>
        )}

        {officers.length === 0 ? (
          <div className="text-center text-gray-500 py-10">لا يوجد ضباط</div>
        ) : (
          groups.map(g => (
            <div key={g.name} className="mb-6">
              <div className="font-bold mb-2" style={{ color: 'rgb(0,0,128)' }}>{toArabicDigits(g.name)}</div>
              <table className="w-full text-sm border border-gray-400 border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 px-2 py-1">م</th>
                    <th className="border border-gray-400 px-2 py-1">الأقدمية</th>
                    <th className="border border-gray-400 px-2 py-1">الرتبة</th>
                    <th className="border border-gray-400 px-2 py-1">الاسم</th>
                    <th className="border border-gray-400 px-2 py-1">الوحدة</th>
                    <th className="border border-gray-400 px-2 py-1">الوظيفة</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((o, i) => (
                    <tr key={o.officer_id}>
                      <td className="border border-gray-400 px-2 py-1 text-center">{toArabicDigits(i + 1)}</td>
                      <td className="border border-gray-400 px-2 py-1 text-center">
                        {[toArabicDigits(o.akdam_no), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}
                      </td>
                      <td className="border border-gray-400 px-2 py-1">{toArabicDigits(o.rank_name) || '-'}</td>
                      <td className="border border-gray-400 px-2 py-1">{toArabicDigits(o.officer_name) || '-'}</td>
                      <td className="border border-gray-400 px-2 py-1">{toArabicDigits(o.unit_name) || '-'}</td>
                      <td className="border border-gray-400 px-2 py-1">{toArabicDigits(o.job_name) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </ReportPage>
  );
}
