import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCommittee } from '../../api/committees';
import { getVotingStatus } from '../../api/evaluations';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { toArabicDigits, formatDate } from '../../utils/format';
import VoteBreakdown from '../../components/VoteBreakdown';

export default function LiveVotingMonitor() {
  const { id } = useParams<{ id: string }>();
  const committeeId = Number(id);

  const [committee, setCommittee] = useState<any>(null);
  const [officers, setOfficers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(() => {
    return Promise.all([getCommittee(committeeId), getVotingStatus(committeeId)])
      .then(([c, s]) => { setCommittee(c.committee); setOfficers(s); })
      .catch((e) => setError(e.response?.data?.error || 'تعذر تحميل بيانات المراقبة'))
      .finally(() => setLoading(false));
  }, [committeeId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useLiveUpdates(fetchData);

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;
  if (!committee) return <div className="card text-center py-10 text-gray-400">اللجنة غير موجودة</div>;

  const active = officers.find((o) => o.is_active === 1);
  const doneCount = officers.filter((o) => o.done === 1).length;
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="page-title mb-0">مراقبة التصويت المباشر</h2>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${committee.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {committee.is_active ? 'الجلسة نشطة' : 'الجلسة متوقفة'}
          </span>
          <Link to={`/admin/committees/${id}/member-scores`} className="btn-secondary text-sm">موقف تقييم الأعضاء</Link>
          <Link to={`/admin/committees/${id}`} className="btn-secondary text-sm">العودة للتفاصيل</Link>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-bold">
            {committee.lagna_cat_name || toArabicDigits(committee.lagna_cat_c)}
          </div>
          <div className="text-sm text-gray-500">بداية اللجنة: {formatDate(committee.lagna_date) || 'غير محدد'}</div>
        </div>
        <div className="text-sm">
          <span className="font-bold text-lg">{toArabicDigits(doneCount)}</span>
          <span className="text-gray-500"> / {toArabicDigits(officers.length)} ضابط تم التصويت عليهم</span>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>}

      {active ? (
        <div className="card mb-4 border-2 border-green-400">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">الضابط الحالي</span>
            <span className="text-sm text-gray-500">م {toArabicDigits(active.serial)}</span>
          </div>
          <div className="text-xl font-bold mb-3">{toArabicDigits([active.rank_name, active.officer_name].filter(Boolean).join(' / '))}</div>
          <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden">
            <div className="bg-green-500 h-3" style={{ width: `${pct(active.voted, active.total)}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>صوّت: <b>{toArabicDigits(active.voted)}</b> / {toArabicDigits(active.total)}</span>
            <VoteBreakdown committeeType={committee.committee_type} ta3nType={active.ta3n_type} counts={active.counts} />
          </div>
        </div>
      ) : (
        <div className="card mb-4 text-center py-4 text-gray-400">لا يوجد ضابط نشط حالياً</div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm text-right whitespace-nowrap">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="p-2">م</th>
              <th className="p-2">الرتبة / الاسم</th>
              <th className="p-2">صوّت</th>
              <th className="p-2">التصويت</th>
              <th className="p-2">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {officers.map((o) => (
              <tr key={`${o.officer_id}-${o.ta3n_type ?? 'x'}`} className={`border-b ${o.is_active === 1 ? 'bg-green-50' : ''}`}>
                <td className="p-2">{toArabicDigits(o.serial)}</td>
                <td className="p-2 font-medium">
                  <Link to={`/admin/committees/${id}/member-scores?officer=${o.officer_id}`} className="text-blue-700 hover:underline">
                    {toArabicDigits([o.rank_name, o.officer_name].filter(Boolean).join(' / '))}
                  </Link>
                </td>
                <td className="p-2">{toArabicDigits(o.voted)} / {toArabicDigits(o.total)}</td>
                <td className="p-2"><VoteBreakdown committeeType={committee.committee_type} ta3nType={o.ta3n_type} counts={o.counts} /></td>
                <td className="p-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    o.is_active === 1 ? 'bg-green-100 text-green-700'
                      : o.done === 1 ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {o.is_active === 1 ? 'نشط' : o.done === 1 ? 'تم' : 'منتظر'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!officers.length && <div className="text-center text-gray-400 py-6">لا يوجد ضباط</div>}
      </div>
    </div>
  );
}
