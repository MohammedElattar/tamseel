import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getOfficerServiceResult } from '../../api/evaluations';
import { toArabicDigits } from '../../utils/format';
import BackButton from '../../components/member/BackButton';

// نتيجة تقييم مسير الخدمة (image2.1): the seven career components with their max degrees and the
// officer's entered scores (from المرحلة ٢), then the total and إجمالي نسبة التقييم %. Read-only,
// reached from the voting screen footer; server-guarded to the member's active committee.
export default function OfficerServiceScreen() {
  const { officerId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = Number(officerId);
    if (!Number.isInteger(id)) { setError('معرف الضابط غير صحيح'); setLoading(false); return; }
    setLoading(true);
    setError('');
    getOfficerServiceResult(id)
      .then(setData)
      .catch(() => setError('تعذر تحميل نتيجة مسير الخدمة'))
      .finally(() => setLoading(false));
  }, [officerId]);

  const basis: any[] = data?.basis || [];
  const score: any = data?.score || null;
  const totalMax = data?.total_max ?? 0;
  const total = score?.total ?? null;
  const pct = score?.pct ?? null;
  const fmt = (v: any) =>
    v == null ? '—' : toArabicDigits(Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="rounded-xl border-2 border-gray-300 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-xl font-bold text-blue-900">نتيجة تقييم مسير الخدمة</h2>
          <BackButton />
        </div>
        <div className="p-4">
          {loading ? (
            <div className="py-10 text-center text-gray-600">جاري التحميل...</div>
          ) : error ? (
            <div className="py-10 text-center font-bold text-red-800">{error}</div>
          ) : (
            <>
              <table className="w-full text-sm border border-slate-200 rounded overflow-hidden">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-right px-3 py-2">البند</th>
                    <th className="text-center px-3 py-2 w-32">الدرجة القصوى</th>
                    <th className="text-center px-3 py-2 w-28">التقييم</th>
                  </tr>
                </thead>
                <tbody>
                  {basis.map((b: any) => (
                    <tr key={b.component} className="border-t border-slate-200">
                      <td className="px-3 py-2">{b.label}</td>
                      <td className="text-center px-3 py-2">{toArabicDigits(b.max_degree)}</td>
                      <td className="text-center px-3 py-2 font-bold">{fmt(score?.[b.component])}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                    <td className="px-3 py-2">المجموع</td>
                    <td className="text-center px-3 py-2">{toArabicDigits(totalMax)}</td>
                    <td className="text-center px-3 py-2">{fmt(total)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                <span className="text-slate-600 text-sm">إجمالي نسبة التقييم: </span>
                <span className="text-2xl font-bold text-blue-800">
                  {pct != null ? toArabicDigits(pct) + '٪' : '—'}
                </span>
                {total != null && totalMax > 0 && (
                  <span className="text-slate-500 text-sm">
                    {' '}({toArabicDigits(total)} / {toArabicDigits(totalMax)})
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
