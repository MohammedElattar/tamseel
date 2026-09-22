import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { getOfficerScoring, saveOfficerScoring } from '../../api/scoring';
import { toArabicDigits, toWesternDigits, formatDate } from '../../utils/format';

// Per-officer «مسير الخدمة» entry (نظير OFFICERS_TAKYEEM): each component shows its imported data,
// and the evaluator types the degree beneath it. The kafaa average, the total, and the percentage
// are computed automatically. Admin-entered; the resulting % is what members later see as a بند.
export default function ServiceScoreEntry() {
  const { id } = useParams();
  const officerId = Number(id);
  const [searchParams] = useSearchParams();
  const committeeId = searchParams.get('committee');
  const [d, setD] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [english, setEnglish] = useState('');

  const load = useCallback(() => {
    return getOfficerScoring(officerId).then((data) => {
      setD(data);
      const init: Record<string, string> = {};
      for (const b of (data.basis || [])) {
        const saved = data.score?.[b.component];
        if (saved != null) init[b.component] = String(saved);
        else if (b.component === 'tahil' && data.tahil_prefill != null) init[b.component] = String(data.tahil_prefill);
        else init[b.component] = '';
      }
      setScores(init);
      setEnglish(data.score?.english != null ? String(data.score.english) : '');
    }).finally(() => setLoading(false));
  }, [officerId]);

  useEffect(() => { load(); }, [load]);

  const basis: any[] = d?.basis || [];
  const totalMax: number = d?.total_max || 0;
  const total = basis.reduce((s, b) => s + (Number(scores[b.component]) || 0), 0);
  const pct = totalMax > 0 ? Math.round((total / totalMax) * 1000) / 10 : 0;

  const setScore = (component: string, val: string) =>
    setScores((s) => ({ ...s, [component]: toWesternDigits(val).replace(/[^0-9.]/g, '') }));

  const setEnglishInput = (val: string) => {
    let west = toWesternDigits(val).replace(/[^0-9.]/g, '');
    if (west !== '' && Number(west) > 100) west = '100';
    setEnglish(west);
  };

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const payload: Record<string, number | null> = {};
      for (const b of basis) payload[b.component] = scores[b.component] === '' ? null : Number(scores[b.component]);
      payload.english = english === '' ? null : Number(english);
      await saveOfficerScoring(officerId, payload);
      setMsg('تم حفظ الدرجات');
      await load();
    } catch {
      setMsg('تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">جاري التحميل...</div>;
  if (!d?.officer) return <div className="card text-center py-10 text-gray-400">الضابط غير موجود</div>;

  const o = d.officer;
  const data = d.data || {};

  const renderData = (component: string) => {
    switch (component) {
      case 'jobs':
        return <MiniTable rows={data.jobs} cols={[
          ['ran_n', 'الرتبة'], ['unt_n', 'الوحدة'], ['job_n', 'الوظيفة'],
          ['wasfia_tuahel_trky', 'تؤهل للترقي'], ['__period', 'المدة'],
        ]} empty="لا توجد وظائف" />;
      case 'kafaa':
        return (
          <div>
            <div className="mb-2 text-sm">
              <span className="text-gray-500">متوسط تقارير الكفاءة: </span>
              <b className="text-blue-800">{d.kafaa_avg != null ? toArabicDigits(d.kafaa_avg) : '—'}</b>
            </div>
            <MiniTable rows={data.kafaa} cols={[
              ['from_date_c', 'من'], ['to_date', 'إلى'], ['kaed', 'القائد'], ['mosdak', 'المصدق'], ['grade_com', 'التقدير'],
            ]} empty="لا توجد تقارير" />
          </div>
        );
      case 'tashkeelat':
        return (data.tashkeelat && data.tashkeelat.length) ? (
          <div className="text-sm text-gray-700">
            مدة التشكيلات: <b>{toArabicDigits(data.tashkeelat[0].tashkeelat ?? '—')}</b>
            <span className="mx-3">|</span>
            مدة الخدمة: <b>{toArabicDigits(data.tashkeelat[0].khadma ?? '—')}</b>
          </div>
        ) : <Empty t="لا توجد بيانات تشكيلات" />;
      case 'tahil':
        return <MiniTable rows={data.qualification} cols={[['txt', 'التأهيل'], ['grade', 'الدرجة المستوردة']]} empty="لا يوجد تأهيل" />;
      case 'awsama':
        return (data.medals && data.medals.length)
          ? <ul className="list-disc pr-5 text-sm text-gray-700 space-y-0.5">{data.medals.map((m: any, i: number) => <li key={i}>{toArabicDigits(m.wis_n)}</li>)}</ul>
          : <Empty t="لا توجد أوسمة" />;
      case 'ba3asat':
        return <MiniTable rows={data.ba3asat} cols={[
          ['activ_name', 'النوع'], ['country_name', 'الدولة'], ['activ_note', 'البيان'], ['date_from', 'من'], ['date_to', 'إلى'],
        ]} empty="لا توجد بعثات" dateKeys={['date_from', 'date_to']} />;
      case 'gaza':
        return (data.geza && data.geza.length)
          ? <ul className="list-disc pr-5 text-sm text-gray-700 space-y-1">{data.geza.map((g: any, i: number) => <li key={i}>{toArabicDigits(g.gaza)}</li>)}</ul>
          : <Empty t="لا توجد محاكمات أو جزاءات" />;
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="page-title mb-0">درجات مسير الخدمة</h2>
          <p className="text-sm text-gray-500 mt-1">
            {toArabicDigits([o.rank_name, o.per_name].filter(Boolean).join(' / '))}
            {o.akdam_no != null ? ` — أقدمية ${toArabicDigits(o.akdam_no)}${o.akdam_rep ? ' ' + toArabicDigits(o.akdam_rep) : ''}` : ''}
          </p>
        </div>
        <Link
          to={committeeId ? `/admin/committees/${committeeId}?tab=service-scores` : `/admin/officers/${officerId}`}
          className="btn-secondary text-sm"
        >
          {committeeId ? 'العودة للجنة' : 'العودة لملف الضابط'}
        </Link>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm mb-3">{msg}</div>}

      {/* Sticky total/percentage summary */}
      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 border-2 border-blue-200">
        <div className="text-sm">
          <span className="text-gray-500">المجموع: </span>
          <b className="text-lg">{toArabicDigits(total)}</b>
          <span className="text-gray-400"> / {toArabicDigits(totalMax)}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">مسير الخدمة: </span>
          <b className="text-2xl text-blue-700">{toArabicDigits(pct)}%</b>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? 'جاري الحفظ...' : 'حفظ الدرجات'}
        </button>
      </div>

      {/* لغة إنجليزية: admin-entered بند, separate from the مسير الخدمة total; members see it read-only. */}
      <div className="card mb-4 border-2 border-emerald-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-gray-800">لغة إنجليزية</h3>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">الدرجة</label>
            <input
              className="input-field py-1 w-28 text-center border-amber-400 bg-amber-50 font-bold"
              value={toArabicDigits(english)}
              onChange={(e) => setEnglishInput(e.target.value)}
              inputMode="numeric"
              placeholder="٠"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {basis.map((b) => (
          <div key={b.component} className="card">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">
                {toArabicDigits(b.label)}
                <span className="text-xs text-gray-400 font-normal"> (حد أقصى {toArabicDigits(b.max_degree)})</span>
              </h3>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">الدرجة</label>
                <input
                  className="input-field py-1 w-28 text-center border-amber-400 bg-amber-50 font-bold"
                  value={toArabicDigits(scores[b.component] ?? '')}
                  onChange={(e) => setScore(b.component, e.target.value)}
                  inputMode="numeric"
                  placeholder="٠"
                />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-2">{renderData(b.component)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ t }: { t: string }) {
  return <p className="text-sm text-gray-400">{t}</p>;
}

function MiniTable({ rows, cols, empty, dateKeys = [] }: {
  rows: any[] | undefined; cols: [string, string][]; empty: string; dateKeys?: string[];
}) {
  if (!rows || !rows.length) return <Empty t={empty} />;
  const cell = (r: any, key: string) => {
    if (key === '__period') return toArabicDigits([r.year ? `${r.year} سنة` : '', r.month ? `${r.month} شهر` : ''].filter(Boolean).join(' '));
    if (dateKeys.includes(key)) return formatDate(r[key]) || '—';
    return toArabicDigits(r[key] ?? '') || '—';
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b">
            {cols.map(([, label]) => <th key={label} className="px-2 py-1 text-right font-medium">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              {cols.map(([key]) => <td key={key} className="px-2 py-1">{cell(r, key)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
