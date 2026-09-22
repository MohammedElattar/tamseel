import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getCommittee } from '../../../api/committees';
import ReportPage from '../../../components/reports/ReportPage';
import { toArabicDigits, formatDate } from '../../../utils/format';
import { useLiveUpdates } from '../../../hooks/useLiveUpdates';

export default function CommitteeMembersReport() {
  const { id } = useParams<{ id: string }>();
  const [committee, setCommittee] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    return getCommittee(Number(id))
      .then(d => {
        setCommittee(d.committee);
        setMembers((d.members || []).filter((m: any) => m.included === 1));
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useLiveUpdates(fetchData);

  const today = new Date().toISOString().split('T')[0];

  return (
    <ReportPage loading={loading}>
      <div className="px-10 py-8" style={{ minHeight: '29.7cm' }}>
        <h1 className="text-center text-2xl font-bold underline mb-8" style={{ color: 'rgb(0,0,128)' }}>
          أسماء السادة أعضاء لجنة التقييم
        </h1>

        {committee && (
          <div className="text-center mb-6">
            <div
              className="inline-block text-xl font-bold underline px-6 py-1"
              style={{ color: 'rgb(0,0,128)', backgroundColor: '#e5e7eb' }}
            >
              {toArabicDigits(committee.lagna_cat_name || committee.lagna_cat_c)}
            </div>
            <div className="mt-3 font-bold">
              بتاريخ : {formatDate(committee.lagna_date)}
            </div>
          </div>
        )}

        <table className="w-full border-collapse mt-4 text-sm">
          <thead>
            <tr className="font-bold" style={{ backgroundColor: '#d1d5db' }}>
              <th className="border-2 border-gray-500 py-1" style={{ width: '10%' }}>م</th>
              <th className="border-2 border-gray-500 py-1" style={{ width: '35%' }}>الرتبة</th>
              <th className="border-2 border-gray-500 py-1" style={{ width: '55%' }}>الاسم</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.user_id ?? i} className="font-bold text-center">
                <td className="border border-gray-500 py-1">{toArabicDigits(i + 1)}</td>
                <td className="border border-gray-500 py-1">{toArabicDigits(m.rank_name || '')}</td>
                <td className="border border-gray-500 py-1">{toArabicDigits(m.officer_name || '')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-left mt-10 font-bold">
          التاريخ : {formatDate(today)}
        </div>
      </div>
    </ReportPage>
  );
}
