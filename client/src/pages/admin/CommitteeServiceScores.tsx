import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getCommitteeScoring } from '../../api/scoring';
import { toArabicDigits } from '../../utils/format';

// روستر «درجات مسير الخدمة» داخل اللجنة: قائمة بضباط اللجنة مع نسبة كلٍّ وحالة إدخال درجاته،
// ورابط لشاشة إدخال الدرجات لكل ضابط (تعود إلى هذا التبويب عند الرجوع).
export default function CommitteeServiceScores({ committeeId }: { committeeId: number }) {
  const [officers, setOfficers] = useState<any[]>([]);
  const [scored, setScored] = useState(0);
  const [totalMax, setTotalMax] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    return getCommitteeScoring(committeeId)
      .then((d) => {
        setOfficers(d.officers || []);
        setScored(d.scored || 0);
        setTotalMax(d.total_max || 0);
      })
      .finally(() => setLoading(false));
  }, [committeeId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;

  const total = officers.length;

  if (!total) {
    return (
      <div className="card text-center py-10 text-gray-400">لا يوجد ضباط في هذه اللجنة</div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-gray-800">درجات مسير الخدمة</h3>
        </div>
        <div className="text-sm whitespace-nowrap">
          <span className="text-gray-500">تم تقييم </span>
          <b className="text-blue-700">{toArabicDigits(scored)}</b>
          <span className="text-gray-500"> من </span>
          <b>{toArabicDigits(total)}</b>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600 text-right">
              <th className="px-4 py-3 font-medium">م</th>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">الرتبة</th>
              <th className="px-4 py-3 font-medium text-center">النسبة</th>
              <th className="px-4 py-3 font-medium text-center">الحالة</th>
              <th className="px-4 py-3 font-medium text-center">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {officers.map((o) => (
              <tr key={o.officer_id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2">{toArabicDigits(o.serial ?? '')}</td>
                <td className="px-4 py-2 font-medium">{toArabicDigits(o.officer_name ?? '')}</td>
                <td className="px-4 py-2">{toArabicDigits(o.rank_name ?? '')}</td>
                <td className="px-4 py-2 text-center">
                  {o.has_score ? <b className="text-blue-700">{toArabicDigits(o.pct)}٪</b> : '—'}
                </td>
                <td className="px-4 py-2 text-center">
                  <span
                    className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-xs ${
                      o.has_score ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {o.has_score ? 'تم' : 'لم يتم'}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <Link
                    to={`/admin/officers/${o.officer_id}/service-score?committee=${committeeId}`}
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    إدخال / تعديل الدرجات
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
