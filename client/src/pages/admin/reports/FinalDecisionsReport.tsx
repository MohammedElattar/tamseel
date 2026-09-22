import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getFinalDecisions } from '../../../api/committees';
import ReportPage from '../../../components/reports/ReportPage';
import { toArabicDigits, formatDate } from '../../../utils/format';
import { useLiveUpdates } from '../../../hooks/useLiveUpdates';

export default function FinalDecisionsReport() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    () => getFinalDecisions(Number(id)).then(setData).finally(() => setLoading(false)),
    [id]
  );
  useEffect(() => { fetchData(); }, [fetchData]);
  useLiveUpdates(fetchData);

  const committee = data?.committee;
  const groups: any[] = data?.groups || [];

  return (
    <ReportPage loading={loading}>
      <div className="report-font px-10 py-6" dir="rtl">
        <div className="flex items-start justify-between mb-2">
          <div className="text-sm font-bold text-center leading-6">
            <div>القوات البحرية</div>
            <div>فرع شئون الضباط</div>
          </div>
          {committee?.lagna_date && (
            <div className="text-sm font-bold">
              التاريخ: <span className="underline">{formatDate(committee.lagna_date)}</span>
            </div>
          )}
        </div>

        <h1 className="text-center text-2xl font-bold mb-6">ملخص قرارات اللجنة القضائية والإدارية</h1>

        {groups.length === 0 ? (
          <div className="text-center text-gray-400 py-10">لا يوجد ضباط</div>
        ) : (
          groups.map((g) => (
            <div key={g.ta3n_type} className="mb-6" style={{ breakInside: 'avoid' }}>
              <div className="font-bold text-lg mb-1">{g.ta3n_name}</div>
              <table className="w-full text-sm border-collapse" style={{ border: '1px solid #333' }}>
                <thead>
                  <tr>
                    {['م', 'الرتبة', 'الاسم', 'عدد الموافقين', 'عدد الرافضين', 'النتيجة النهائية'].map((h) => (
                      <th key={h} className="font-bold px-2 py-1 text-center" style={{ border: '1px solid #333' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.officers.map((o: any) => (
                    <tr key={o.officer_id}>
                      <td className="px-2 py-1 text-center" style={{ border: '1px solid #333' }}>{toArabicDigits(o.serial)}</td>
                      <td className="px-2 py-1 text-center" style={{ border: '1px solid #333' }}>{toArabicDigits(o.rank_name)}</td>
                      <td className="px-2 py-1 text-center" style={{ border: '1px solid #333' }}>{toArabicDigits(o.officer_name)}</td>
                      <td className="px-2 py-1 text-center" style={{ border: '1px solid #333' }}>{toArabicDigits(o.acceptors)}</td>
                      <td className="px-2 py-1 text-center" style={{ border: '1px solid #333' }}>{toArabicDigits(o.refusers)}</td>
                      <td
                        className="px-2 py-1 text-center font-bold text-gray-900"
                        style={{ border: '1px solid #333' }}
                      >
                        {toArabicDigits(o.final_decision) || '-'}
                      </td>
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
