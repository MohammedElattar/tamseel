import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getOfficerForEdit, saveOfficer } from '../../api/officers';
import { toArabicDigits, toWesternDigits } from '../../utils/format';
import ArabicDate from '../../components/ArabicDate';

type FieldType = 'text' | 'num' | 'date' | 'monthyear' | 'textarea' | 'select';
interface FieldSpec { key: string; label: string; type: FieldType; options?: { value: string; label: string }[]; }
interface SectionSpec { key: string; title: string; fields: FieldSpec[]; }

// Officer identity fields (in_service is rendered as a select below, not here).
const IDENTITY_FIELDS: FieldSpec[] = [
  { key: 'per_name', label: 'الاسم', type: 'text' },
  { key: 'full_rank', label: 'الرتبة', type: 'text' },
  { key: 'akdam_no', label: 'الأقدمية', type: 'num' },
  { key: 'akdam_rep', label: 'حرف الأقدمية', type: 'text' },
  { key: 'person_id', label: 'الرقم العسكري', type: 'num' },
  { key: 'unt_n', label: 'الوحدة', type: 'text' },
  { key: 'job_n', label: 'الوظيفة', type: 'text' },
  { key: 'speciality', label: 'التخصص', type: 'text' },
  { key: 'taraky_tagdeed', label: 'الترقية / التجديد', type: 'text' },
];

const BASIC_FIELDS: FieldSpec[] = [
  { key: 'height', label: 'الطول', type: 'num' },
  { key: 'weight', label: 'الوزن', type: 'num' },
  { key: 'fark_wazn', label: 'زيادة الوزن', type: 'num' },
  { key: 'marital_status', label: 'الحالة الاجتماعية', type: 'text' },
  { key: 'wife_status', label: 'حالة الزوجة', type: 'text' },
  { key: 'boy_no', label: 'عدد الأبناء', type: 'num' },
  { key: 'girl_no', label: 'عدد البنات', type: 'num' },
  { key: 'faculty', label: 'الكلية / المعهد', type: 'text' },
  { key: 'mil_qualification', label: 'أعلى تأهيل', type: 'text' },
  { key: 'civil_qualification', label: 'التأهيل المدني', type: 'text' },
  { key: 'entedab', label: 'الانتداب', type: 'text' },
  { key: 'off_notice', label: 'ملاحظة', type: 'text' },
  { key: 'taraky_estifa', label: 'ملخص الاستيفاء', type: 'text' },
  { key: 'estifa_job', label: 'الوظيفة المؤهلة', type: 'text' },
  { key: 'se7a', label: 'اللياقة', type: 'text' },
  { key: 'kafaa_takreer', label: 'ملاحظة الكفاءة', type: 'text' },
  { key: 'mohakma_geza', label: 'محاكمة / جزاء', type: 'text' },
  { key: 'kyada', label: 'القيادة', type: 'text' },
  { key: 'ragba', label: 'الرغبة', type: 'text' },
  { key: 'ra8ba_twsia', label: 'توصية القائد', type: 'text' },
];

// Nested tables. Keys/columns mirror the server allowlists in routes/officers.ts.
const SECTIONS: SectionSpec[] = [
  {
    key: 'jobs', title: 'الوظائف السابقة',
    fields: [
      { key: 'ran_n', label: 'الرتبة', type: 'text' },
      { key: 'unt_n', label: 'الوحدة', type: 'text' },
      { key: 'job_n', label: 'الوظيفة', type: 'text' },
      { key: 'ran_n_mrtb', label: 'المرتب', type: 'text' },
      { key: 'wasfia_tuahel_trky', label: 'الوظيفة تؤهل للترقي', type: 'text' },
      { key: 'from_date', label: 'من', type: 'date' },
      { key: 'to_date', label: 'إلى', type: 'date' },
      { key: 'year', label: 'السنة', type: 'num' },
      { key: 'month', label: 'الشهر', type: 'num' },
      { key: 'taraky_c', label: 'كود الترقي', type: 'num' },
      { key: 'taraky_c_suggested', label: 'كود الترقي المقترح', type: 'num' },
      {
        key: 'marked_color', label: 'تمييز الصف', type: 'select',
        // One highlight colour now (light sky-blue); any stored value renders the same, so a
        // single option is all that's needed alongside the built-in "—" (no highlight).
        options: [
          { value: 'light_green', label: 'أزرق فاتح' },
        ],
      },
    ],
  },
  {
    key: 'kafaa', title: 'تقارير الكفاءة',
    fields: [
      { key: 'from_date_c', label: 'من (شهر-سنة)', type: 'monthyear' },
      { key: 'to_date', label: 'إلى (شهر-سنة)', type: 'monthyear' },
      { key: 'kaed', label: 'تقييم القائد المباشر', type: 'num' },
      { key: 'mosdak', label: 'تقييم القائد المصدق', type: 'num' },
      { key: 'from_date', label: 'التاريخ (للترتيب)', type: 'date' },
      { key: 'grade_com', label: 'التقدير', type: 'text' },
    ],
  },
  {
    key: 'paasat', title: 'البعثات والمأموريات',
    fields: [
      { key: 'activ_name', label: 'النشاط', type: 'text' },
      { key: 'activ_note', label: 'البيان', type: 'text' },
      { key: 'activ_code', label: 'كود النشاط', type: 'num' },
      { key: 'date_from', label: 'من', type: 'date' },
      { key: 'date_to', label: 'إلى', type: 'date' },
      { key: 'country_name', label: 'الدولة', type: 'text' },
    ],
  },
  {
    key: 'punishments', title: 'المحاكمات / الجزاءات',
    fields: [{ key: 'gaza', label: 'البيان', type: 'textarea' }],
  },
  {
    key: 'health', title: 'الحالة الصحية',
    fields: [{ key: 'se7a', label: 'البيان', type: 'textarea' }],
  },
  {
    key: 'children', title: 'الأبناء',
    fields: [
      { key: 'name', label: 'الاسم', type: 'text' },
      { key: 'gender', label: 'النوع', type: 'select', options: [
        { value: 'ذكر', label: 'ذكر' },
        { value: 'أنثى', label: 'أنثى' },
      ] },
      { key: 'date_birth', label: 'تاريخ الميلاد', type: 'date' },
      { key: 'notes', label: 'ملاحظات', type: 'text' },
    ],
  },
];

// A single input bound to a field spec. Numeric inputs show Arabic-Indic digits and parse
// typed input back to Western; dates use the shared ArabicDate (value/onChange stay ISO).
function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: any; onChange: (v: any) => void }) {
  if (spec.type === 'date') {
    return <ArabicDate value={value || ''} onChange={onChange} />;
  }
  if (spec.type === 'num') {
    return (
      <input
        className="input-field"
        inputMode="numeric"
        value={toArabicDigits(value ?? '')}
        onChange={e => onChange(toWesternDigits(e.target.value).replace(/[^0-9.]/g, ''))}
      />
    );
  }
  // فترة التقرير is stored as a MM-YYYY label, not a real date, so it gets the numeric
  // treatment (Arabic-Indic on screen, Western in state) while keeping its separator.
  if (spec.type === 'monthyear') {
    return (
      <input
        className="input-field"
        inputMode="numeric"
        placeholder="شهر-سنة"
        value={toArabicDigits(value ?? '')}
        onChange={e => onChange(toWesternDigits(e.target.value).replace(/[^0-9-]/g, ''))}
      />
    );
  }
  if (spec.type === 'textarea') {
    return <textarea className="input-field" rows={3} value={value ?? ''} onChange={e => onChange(e.target.value)} />;
  }
  if (spec.type === 'select') {
    return (
      <select className="input-field" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">—</option>
        {spec.options?.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  return <input className="input-field" value={value ?? ''} onChange={e => onChange(e.target.value)} />;
}

// A repeatable nested-table editor: each row is a card of inputs with add/delete.
function NestedEditor({ section, rows, onChange }: {
  section: SectionSpec; rows: any[]; onChange: (rows: any[]) => void;
}) {
  const single = section.fields.length === 1;
  const update = (i: number, key: string, val: any) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, Object.fromEntries(section.fields.map(f => [f.key, '']))]);

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-gray-800">{section.title}</h3>
        <button type="button" onClick={add} className="btn-secondary text-sm">+ إضافة</button>
      </div>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-sm text-gray-400">لا توجد بيانات</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className={single ? 'flex-1' : 'grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
                  {section.fields.map(f => (
                    <label key={f.key} className="block">
                      {!single && <span className="label">{f.label}</span>}
                      <FieldInput spec={f} value={row[f.key]} onChange={v => update(i, f.key, v)} />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="shrink-0 rounded-lg border border-red-200 px-3 py-1 text-sm font-bold text-red-600 hover:bg-red-50"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OfficerEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getOfficerForEdit(Number(id))
      .then(d => { if (active) setForm(d); })
      .catch(() => { if (active) setError('تعذر تحميل بيانات الضابط'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const setOfficerField = (key: string, val: any) =>
    setForm((f: any) => ({ ...f, officer: { ...f.officer, [key]: val } }));
  const setSection = (key: string, next: any[]) =>
    setForm((f: any) => ({ ...f, [key]: next }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await saveOfficer(Number(id), form);
      navigate(`/admin/officers/${id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'فشل حفظ التعديلات');
      setSaving(false);
    }
  };

  if (loading) return <div className="card py-10 text-center text-gray-400">جاري التحميل...</div>;
  if (!form) return <div className="card py-10 text-center text-gray-400">{error || 'لا توجد بيانات'}</div>;

  const o = form.officer || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <h2 className="page-title mb-0">تعديل بيانات الضابط</h2>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
          <Link to={`/admin/officers/${id}`} className="btn-secondary text-sm">إلغاء</Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="card">
        <h3 className="mb-3 font-bold text-gray-800">البيانات الأساسية</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {IDENTITY_FIELDS.map(f => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <FieldInput spec={f} value={o[f.key]} onChange={v => setOfficerField(f.key, v)} />
            </label>
          ))}
          <label className="block">
            <span className="label">في الخدمة</span>
            <select
              className="input-field"
              value={o.in_service ?? 'Y'}
              onChange={e => setOfficerField('in_service', e.target.value)}
            >
              <option value="Y">بالخدمة</option>
              <option value="N">خارج الخدمة</option>
            </select>
          </label>
          {BASIC_FIELDS.map(f => (
            <label key={f.key} className="block">
              <span className="label">{f.label}</span>
              <FieldInput spec={f} value={o[f.key]} onChange={v => setOfficerField(f.key, v)} />
            </label>
          ))}
        </div>
      </div>

      {SECTIONS.map(s => (
        <NestedEditor key={s.key} section={s} rows={form[s.key] || []} onChange={next => setSection(s.key, next)} />
      ))}

      <div className="flex justify-end gap-2 no-print">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
        </button>
        <Link to={`/admin/officers/${id}`} className="btn-secondary">إلغاء</Link>
      </div>
    </div>
  );
}
