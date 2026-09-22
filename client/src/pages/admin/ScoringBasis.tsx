import { useState, useEffect } from 'react';
import { getScoreBasis, updateScoreBasis } from '../../api/scoring';
import { toArabicDigits, toWesternDigits } from '../../utils/format';

// أسس التقييم: edit the max degree per مسير الخدمة component. Their sum is the percentage base.
export default function ScoringBasis() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getScoreBasis().then((d) => setRows(d.basis || [])).finally(() => setLoading(false));
  }, []);

  const total = rows.reduce((s, r) => s + (Number(r.max_degree) || 0), 0);

  const setMax = (component: string, val: string) =>
    setRows((rs) => rs.map((r) => (r.component === component
      ? { ...r, max_degree: toWesternDigits(val).replace(/[^0-9.]/g, '') }
      : r)));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const d = await updateScoreBasis(rows.map((r) => ({
        component: r.component, max_degree: Number(r.max_degree) || 0, label: r.label,
      })));
      setRows(d.basis || []);
      setMsg('تم الحفظ');
    } catch {
      setMsg('تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;

  return (
    <div>
      <h2 className="page-title">قاعدة التقييم — أسس مسير الخدمة</h2>
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-3">{msg}</div>}

      <div className="card overflow-x-auto p-0 max-w-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600 text-right">
              <th className="px-4 py-3 font-medium">المكوّن</th>
              <th className="px-4 py-3 font-medium">الحد الأقصى</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.component} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2 font-medium">{toArabicDigits(r.label)}</td>
                <td className="px-4 py-2">
                  <input
                    className="input-field py-1 w-28 text-center"
                    value={toArabicDigits(r.max_degree ?? '')}
                    onChange={(e) => setMax(r.component, e.target.value)}
                    inputMode="numeric"
                  />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 font-bold bg-gray-50">
              <td className="px-4 py-2">المجموع الأقصى</td>
              <td className="px-4 py-2 text-center">{toArabicDigits(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary mt-4 disabled:opacity-50">
        {saving ? 'جاري الحفظ...' : 'حفظ'}
      </button>
    </div>
  );
}
