import { useState, useEffect, useCallback } from 'react';
import { getOfficersRequirements } from '../../api/officers';
import { toArabicDigits, formatDate } from '../../utils/format';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

const Mark = ({ ok }: { ok: boolean }) => (
  <span className={ok ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{ok ? '✓' : '✗'}</span>
);

export default function OfficersRequirements() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(
    () => getOfficersRequirements().then(setData).finally(() => setLoading(false)),
    []
  );
  useEffect(() => { fetchData(); }, [fetchData]);
  useLiveUpdates(fetchData);

  const officers: any[] = data?.officers || [];
  const incomplete = officers.filter((o) => !o.complete).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="page-title mb-0">نواقص ضباط المشروع</h2>
        {data?.nashra_date && (
          <span className="text-sm text-gray-500">نشرة: {formatDate(data.nashra_date)}</span>
        )}
      </div>

      {loading ? (
        <div className="card text-center py-10 text-gray-400">جاري التحميل...</div>
      ) : officers.length === 0 ? (
        <div className="card text-center py-10 text-gray-400">لا يوجد ضباط بالنشرة</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="card text-center">
              <p className="text-2xl font-bold text-blue-600">{toArabicDigits(officers.length)}</p>
              <p className="text-sm text-gray-500 mt-1">إجمالي الضباط</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-green-600">{toArabicDigits(officers.length - incomplete)}</p>
              <p className="text-sm text-gray-500 mt-1">مكتمل البيانات</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-red-600">{toArabicDigits(incomplete)}</p>
              <p className="text-sm text-gray-500 mt-1">به نواقص</p>
            </div>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm text-right whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="px-3 py-3">م</th>
                  <th className="px-3 py-3">الرتبة / الاسم</th>
                  <th className="px-3 py-3">الأقدمية</th>
                  <th className="px-3 py-3 text-center">الصورة الشخصية</th>
                  <th className="px-3 py-3 text-center">الصورة العائلية</th>
                  <th className="px-3 py-3 text-center">تقارير الكفاءة</th>
                  <th className="px-3 py-3 text-center">١٢١ ش ض</th>
                  <th className="px-3 py-3 text-center">الأنواط</th>
                  <th className="px-3 py-3">الملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {officers.map((o, i) => (
                  <tr key={o.officer_id} className={`border-b border-gray-100 last:border-0 ${o.complete ? '' : 'bg-red-50'}`}>
                    <td className="px-3 py-2">{toArabicDigits(i + 1)}</td>
                    <td className="px-3 py-2 font-medium">{toArabicDigits([o.rank_name, o.per_name].filter(Boolean).join(' / '))}</td>
                    <td className="px-3 py-2">{toArabicDigits(o.akdam) || '-'}</td>
                    <td className="px-3 py-2 text-center"><Mark ok={o.personal} /></td>
                    <td className="px-3 py-2 text-center"><Mark ok={o.family} /></td>
                    <td className="px-3 py-2 text-center"><Mark ok={o.kafaa} /></td>
                    <td className="px-3 py-2 text-center"><Mark ok={o.sheet_121} /></td>
                    <td className="px-3 py-2 text-center"><Mark ok={o.awsama} /></td>
                    <td className="px-3 py-2 text-red-700 text-xs">{toArabicDigits(o.notes || (o.complete ? '' : o.missing.join('، ')))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
