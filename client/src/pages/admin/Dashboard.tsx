import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getCommittees } from '../../api/committees';
import { toArabicDigits, formatDate } from '../../utils/format';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشطة',
  completed: 'مكتملة',
};

export default function AdminDashboard() {
  const [committees, setCommittees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCommittees = useCallback(() => {
    return getCommittees().then(setCommittees).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCommittees(); }, [fetchCommittees]);
  useLiveUpdates(fetchCommittees);

  const active = committees.find((c: any) => c.is_active || c.status === 'active');
  const draftCount = committees.filter((c: any) => c.status === 'draft').length;
  const completedCount = committees.filter((c: any) => c.status === 'completed').length;

  return (
    <div>
      <h2 className="page-title">لوحة التحكم</h2>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-blue-600">{toArabicDigits(committees.length)}</p>
          <p className="text-sm text-gray-500 mt-1">إجمالي اللجان</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-600">{toArabicDigits(draftCount)}</p>
          <p className="text-sm text-gray-500 mt-1">مسودة</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{toArabicDigits(completedCount)}</p>
          <p className="text-sm text-gray-500 mt-1">مكتملة</p>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-10 text-gray-400">جاري التحميل...</div>
      ) : active ? (
        <div className="card border-green-300 border-2 mb-6">
          <h3 className="text-lg font-bold mb-2">اللجنة النشطة</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base">
                لجنة التمثيل العسكري{active.training_year != null ? ` — ${toArabicDigits(active.training_year)}` : ''}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                بداية اللجنة: {formatDate(active.lagna_date) || 'غير محدد'}
              </p>
            </div>
            <Link to={`/admin/committees/${active.id}`} className="btn-primary text-sm">
              عرض التفاصيل
            </Link>
          </div>
        </div>
      ) : (
        <div className="card text-center py-8 mb-6">
          <p className="text-gray-400 mb-4">لا توجد لجنة نشطة حالياً</p>
          <Link to="/admin/committees/new" className="btn-primary">إنشاء لجنة جديدة</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Link to="/admin/committees" className="card hover:shadow-md transition-shadow">
          <h3 className="font-bold mb-1">اللجان</h3>
          <p className="text-sm text-gray-500">عرض وإدارة جميع اللجان</p>
        </Link>
        <Link to="/admin/officers" className="card hover:shadow-md transition-shadow">
          <h3 className="font-bold mb-1">الضباط</h3>
          <p className="text-sm text-gray-500">عرض بيانات الضباط</p>
        </Link>
      </div>
    </div>
  );
}
