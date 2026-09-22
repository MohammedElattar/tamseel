import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getOfficerCv } from '../../api/evaluations';
import { toArabicDigits } from '../../utils/format';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import OfficerCvContent from '../../components/officer/OfficerCvContent';

export default function OfficerDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchCv = useCallback(() => {
    return getOfficerCv(Number(id)).then(setData).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchCv(); }, [fetchCv]);
  useLiveUpdates(fetchCv);

  const h = data?.header || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-4 no-print">
        <h2 className="page-title mb-0">ملف الضابط</h2>
        <div className="flex gap-2">
          <Link to={`/admin/officers/${id}/service-score`} className="btn-primary text-sm">درجات مسير الخدمة</Link>
          <Link to={`/admin/officers/${id}/edit`} className="btn-primary text-sm">تعديل</Link>
          <button onClick={() => window.print()} className="btn-secondary text-sm">طباعة</button>
          <Link to="/admin/officers" className="btn-secondary text-sm">العودة للقائمة</Link>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-10 text-gray-400">جاري التحميل...</div>
      ) : !data ? (
        <div className="card text-center py-10 text-gray-400">لا توجد بيانات</div>
      ) : (
        <div className="card">
          <div className="border-b border-gray-100 pb-3 mb-4">
            <p className="text-xl font-bold">{toArabicDigits([h.rank_name, h.per_name].filter(Boolean).join(' / '))}</p>
            <p className="text-sm text-gray-500">
              {h.akdam_no != null ? `أقدمية ${toArabicDigits(h.akdam_no)}${h.akdam_rep ? ' ' + toArabicDigits(h.akdam_rep) : ''}` : ''}
            </p>
          </div>
          <OfficerCvContent data={data} />
        </div>
      )}
    </div>
  );
}
