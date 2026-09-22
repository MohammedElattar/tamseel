import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getCommittees, deleteCommittee } from '../../api/committees';
import { toArabicDigits, formatDate } from '../../utils/format';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  active: 'نشطة',
  completed: 'مكتملة',
  archived: 'مؤرشفة',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  archived: 'bg-yellow-100 text-yellow-700',
};

// Single committee type: every committee is لجنة التمثيل العسكري (distinguished by training year).
const committeeTitle = (c: any) =>
  `لجنة التمثيل العسكري${c?.training_year != null ? ` — ${toArabicDigits(c.training_year)}` : ''}`;

export default function CommitteeList() {
  const [committees, setCommittees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCommittees = useCallback(() => {
    return getCommittees().then(setCommittees).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCommittees(); }, [fetchCommittees]);
  useLiveUpdates(fetchCommittees);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDelete = async (c: any) => {
    const name = committeeTitle(c);
    if (!window.confirm(`هل أنت متأكد من حذف اللجنة (${name})؟\nسيتم حذف جميع بياناتها ولا يمكن التراجع.`)) return;
    setDeletingId(c.id);
    try {
      await deleteCommittee(c.id);
      await fetchCommittees();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'تعذر حذف اللجنة');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;

  const active = committees.find((c: any) => c.is_active || c.status === 'active');
  const others = committees.filter((c: any) => c !== active);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="page-title mb-0">اللجان</h2>
        <Link to="/admin/committees/new" className="btn-primary">إنشاء لجنة جديدة</Link>
      </div>

      {active && (
        <div className="card mb-6 border-green-300 border-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-lg font-bold">
                  {committeeTitle(active)}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs ${statusColors[active.status]}`}>
                  {statusLabels[active.status]}
                </span>
              </div>
              <p className="text-sm text-gray-500">
                بداية اللجنة: {formatDate(active.lagna_date) || 'غير محدد'}
              </p>
            </div>
            <Link to={`/admin/committees/${active.id}`} className="btn-primary text-sm">
              عرض التفاصيل
            </Link>
          </div>
        </div>
      )}

      {!active && committees.length > 0 && (
        <div className="card mb-6 text-center py-6 text-gray-400">
          لا توجد لجنة نشطة حالياً
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-3">
          {others.map((c: any) => (
            <div key={c.id} className="card flex items-center justify-between hover:shadow-md transition-shadow">
              <Link to={`/admin/committees/${c.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg font-bold">
                    {committeeTitle(c)}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${c.status === 'completed' ? 'font-bold' : ''} ${statusColors[c.status]}`}>
                    {c.status === 'completed' ? '✓ ' : ''}{statusLabels[c.status]}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  بداية اللجنة: {formatDate(c.lagna_date) || 'غير محدد'}
                </p>
              </Link>
              <div className="flex items-center gap-4 pr-3 shrink-0">
                {c.status !== 'completed' && c.status !== 'active' && c.is_active !== 1 && (
                  <Link
                    to={`/admin/committees/${c.id}/edit`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-semibold"
                    title="تعديل اللجنة"
                  >
                    تعديل
                  </Link>
                )}
                <button
                  onClick={() => handleDelete(c)}
                  disabled={deletingId === c.id}
                  className="text-red-600 hover:text-red-800 text-sm font-semibold disabled:opacity-50"
                  title="حذف اللجنة"
                >
                  {deletingId === c.id ? 'جارٍ الحذف...' : 'حذف'}
                </button>
                <Link to={`/admin/committees/${c.id}`} className="text-gray-400 text-xl">&larr;</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {committees.length === 0 && (
        <div className="card text-center text-gray-400 py-10">لا توجد لجان بعد</div>
      )}
    </div>
  );
}
