import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getOfficers, deleteOfficer } from '../../api/officers';
import { toArabicDigits, toWesternDigits } from '../../utils/format';

const emptyFilters = { q: '', person_id: '', akdam_no: '', rank: '', in_service: 'Y' };
const LIMIT = 50;

export default function OfficerBrowser() {
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ officers: any[]; total: number }>({ officers: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchOfficers = useCallback((p: number) => {
    setLoading(true);
    const params: Record<string, any> = { page: p, limit: LIMIT };
    Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
    return getOfficers(params).then(setData).finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { fetchOfficers(1); /* initial load */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (e: FormEvent) => { e.preventDefault(); setPage(1); fetchOfficers(1); };
  const onReset = () => { setFilters({ ...emptyFilters }); setPage(1); };
  const goPage = (p: number) => { setPage(p); fetchOfficers(p); };
  const set = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));
  // Numeric filters are shown in Arabic-Indic but held (and sent) as Western digits.
  const setNum = (k: string, v: string) => set(k, toWesternDigits(v).replace(/[^0-9]/g, ''));

  const handleDelete = async (o: any) => {
    const name = toArabicDigits([o.rank_name, o.per_name].filter(Boolean).join(' / ') || o.per_name);
    if (!window.confirm(`سيتم حذف الضابط: ${name}\nهل أنت متأكد؟`)) return;
    setError('');
    try {
      await deleteOfficer(o.id);
      // After removing the last row on a page, fall back to the previous page.
      const target = Math.min(page, Math.max(1, Math.ceil((data.total - 1) / LIMIT)));
      setPage(target);
      fetchOfficers(target);
    } catch (err: any) {
      setError(err.response?.data?.error || 'فشل حذف الضابط');
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));

  return (
    <div>
      <h2 className="page-title">الضباط</h2>

      <form onSubmit={onSearch} className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">الاسم</label>
            <input value={filters.q} onChange={e => set('q', e.target.value)} className="input-field" placeholder="بحث بالاسم..." />
          </div>
          <div>
            <label className="label">الرقم العسكري</label>
            <input value={toArabicDigits(filters.person_id)} onChange={e => setNum('person_id', e.target.value)} className="input-field" inputMode="numeric" />
          </div>
          <div>
            <label className="label">الأقدمية</label>
            <input value={toArabicDigits(filters.akdam_no)} onChange={e => setNum('akdam_no', e.target.value)} className="input-field" inputMode="numeric" />
          </div>
          <div>
            <label className="label">الرتبة</label>
            <input value={filters.rank} onChange={e => set('rank', e.target.value)} className="input-field" placeholder="بحث بالرتبة..." />
          </div>
          <div>
            <label className="label">الحالة</label>
            <select value={filters.in_service} onChange={e => set('in_service', e.target.value)} className="input-field">
              <option value="Y">في الخدمة</option>
              <option value="all">الكل</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button type="submit" className="btn-primary text-sm">بحث</button>
          <button type="button" onClick={onReset} className="btn-secondary text-sm">إعادة تعيين</button>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <div className="text-sm text-gray-500 mb-2">النتائج: {toArabicDigits(data.total)}</div>
        {error && <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <table className="w-full text-sm text-right align-top">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="p-2 whitespace-nowrap">الأقدمية</th>
              <th className="p-2 whitespace-nowrap">الرتبة</th>
              <th className="p-2">الاسم</th>
              <th className="p-2">الوحدة</th>
              <th className="p-2">الوظيفة</th>
              <th className="p-2 whitespace-nowrap">الحالة</th>
              <th className="p-2 whitespace-nowrap">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {data.officers.map((o) => (
              <tr key={o.id} className="border-b hover:bg-gray-50 align-top">
                <td className="p-2 whitespace-nowrap">{[toArabicDigits(o.akdam_no ?? ''), toArabicDigits(o.akdam_rep || '')].filter(Boolean).join(' ') || '-'}</td>
                <td className="p-2">{toArabicDigits(o.rank_name) || '-'}</td>
                <td className="p-2 font-medium">{toArabicDigits(o.per_name)}</td>
                <td className="p-2">{toArabicDigits(o.unit_name) || '-'}</td>
                <td className="p-2">{toArabicDigits(o.job_name) || '-'}</td>
                <td className="p-2">
                  <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-xs ${o.in_service === 'Y' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {o.in_service === 'Y' ? 'في الخدمة' : 'خارج الخدمة'}
                  </span>
                </td>
                <td className="p-2">
                  <div className="flex gap-3 whitespace-nowrap">
                    <Link to={`/admin/officers/${o.id}`} className="text-blue-600 hover:text-blue-800">عرض</Link>
                    <Link to={`/admin/officers/${o.id}/edit`} className="text-blue-600 hover:text-blue-800">تعديل</Link>
                    <button type="button" onClick={() => handleDelete(o)} className="text-red-600 hover:text-red-800">حذف</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="text-center text-gray-400 py-6">جاري التحميل...</div>}
        {!loading && data.officers.length === 0 && <div className="text-center text-gray-400 py-6">لا توجد نتائج</div>}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={() => goPage(page - 1)} disabled={page <= 1} className="btn-secondary text-sm disabled:opacity-50">السابق</button>
            <span className="text-sm text-gray-600">صفحة {toArabicDigits(page)} من {toArabicDigits(totalPages)}</span>
            <button onClick={() => goPage(page + 1)} disabled={page >= totalPages} className="btn-secondary text-sm disabled:opacity-50">التالي</button>
          </div>
        )}
      </div>
    </div>
  );
}
