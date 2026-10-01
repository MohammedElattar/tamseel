import { useState, ReactNode } from 'react';
import { toArabicDigits, formatDate } from '../../utils/format';
import { officerPhotoAlt, officerPhotoSrc } from '../../utils/officerPhoto';
import type { OfficerPhotoKind } from '../../utils/officerPhoto';
import OfficerPhoto from '../member/OfficerPhoto';

// The personal, couple and family photos side by side, so none of them hides behind a click.
// Each frame shows the whole image (object-contain): couple and family photos come in mixed
// portrait/landscape ratios. The preview steps through whichever of them loaded.
function PhotosSection({ officerId }: { officerId: number }) {
  const kinds = ['personal', 'couple', 'family'] as const;
  const [loaded, setLoaded] = useState<Partial<Record<OfficerPhotoKind, boolean>>>({});
  const gallery = kinds
    .filter(k => loaded[k])
    .map(k => ({ src: officerPhotoSrc(officerId, k), alt: officerPhotoAlt(k) }));
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {kinds.map(kind => (
        <OfficerPhoto
          key={kind}
          officerId={officerId}
          kind={kind}
          fit="contain"
          className="h-[60dvh] w-full min-w-0 shadow-md"
          gallery={gallery}
          onStatus={ok => setLoaded(prev => (prev[kind] === ok ? prev : { ...prev, [kind]: ok }))}
        />
      ))}
    </div>
  );
}


interface Col { key: string; label: string; date?: boolean; num?: boolean; pct?: boolean; }

const JOBS_COLS: Col[] = [
  { key: 'ran_n', label: 'الرتبة' },
  { key: 'unt_n', label: 'الوحدة' },
  { key: 'job_n', label: 'الوظيفة' },
  { key: 'ran_n_mrtb', label: 'المرتب' },
  { key: 'from_date', label: 'من', date: true },
  { key: 'to_date', label: 'إلى', date: true },
  { key: 'month', label: 'الشهر', num: true },
  { key: 'year', label: 'السنة', num: true },
];
const KAFAA_COLS: Col[] = [
  { key: 'from_date_c', label: 'من', num: true },
  { key: 'to_date', label: 'إلى', num: true },
  { key: 'commander_rating', label: 'تقييم القائد المباشر', num: true, pct: true },
  { key: 'approver_rating', label: 'تقييم القائد المصدق', num: true, pct: true },
  { key: 'grade_com', label: 'التقدير' },
];
const PAASAT_COLS: Col[] = [
  { key: 'activ_name', label: 'النشاط' },
  { key: 'activ_note', label: 'البيان' },
  { key: 'country_name', label: 'الدولة' },
  { key: 'date_from', label: 'من', date: true },
  { key: 'date_to', label: 'إلى', date: true },
];
// الدراسات العلمية (TAHIL_3LMY): RTL column order puts الدرجة on the right and موضوع الدراسة on
// the left, matching the legacy report.
const TAHIL_COLS: Col[] = [
  { key: 'type', label: 'الدرجة' },
  { key: 'mawkaf', label: 'الموقف' },
  { key: 'subject', label: 'موضوع الدراسة' },
];
// Age in whole years from an ISO birth date to today; null when the date is missing/invalid.
function ageYears(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
  return years >= 0 ? years : null;
}

const CHILDREN_COLS: Col[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'gender', label: 'النوع' },
  { key: 'date_birth', label: 'تاريخ الميلاد', date: true },
  { key: 'age', label: 'العمر', num: true },
];

// التدرج الوظيفي row highlight: the import ships a MARKED_COLOR (e.g. 'dark_green'/'light_green').
// Any career-history row that carries a marked_color value — whatever it is — is highlighted the
// same light sky-blue; other tables leave marked_color undefined and stay unhighlighted.
const ROW_HIGHLIGHT = 'bg-sky-200';

// `large` is the member/voting flavour: bigger type, roomier cells and wrapping instead
// of a nowrap table, for readers around 70. The admin CV page keeps the dense flavour.

// A section table body, or a clear "no data" message when the section is empty.
function TableBody({ rows, cols, large }: { rows: any[]; cols: Col[]; large?: boolean }) {
  if (!rows || rows.length === 0) {
    return (
      <div className={large ? 'py-8 text-center text-xl text-gray-700' : 'text-center text-gray-400 py-6'}>
        لا توجد بيانات
      </div>
    );
  }
  const cell = large ? 'px-3 py-2 align-top' : 'px-3 py-2';
  return (
    <div className={`rounded-lg overflow-x-auto ${large ? 'border-2 border-gray-300' : 'border border-gray-200'}`}>
      <table className={`w-full ${large ? 'text-base' : 'text-sm whitespace-nowrap'}`}>
        <thead>
          <tr className={
            large
              ? 'border-b-2 border-gray-300 bg-gray-100 text-right text-gray-900'
              : 'border-b border-gray-200 text-gray-600 text-right bg-gray-50'
          }>
            {cols.map(c => (
              <th key={c.key} className={`${cell} ${large ? 'font-bold whitespace-nowrap' : 'font-medium'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={`${large ? 'border-b border-gray-200 last:border-0' : 'border-b border-gray-100 last:border-0'} ${
                String(r?.marked_color ?? '').trim() ? ROW_HIGHLIGHT : ''
              }`}
            >
              {cols.map(c => (
                <td key={c.key} className={`${cell} ${large ? 'font-bold text-gray-900' : ''} ${large && (c.date || c.num) ? 'whitespace-nowrap' : ''}`}>
                  {c.date
                    ? formatDate(r[c.key]) || '-'
                    : c.num
                    ? r[c.key] != null ? `${toArabicDigits(r[c.key])}${c.pct ? '%' : ''}` : '-'
                    : toArabicDigits(r[c.key]) || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Any plain text/number reaching a field is shown in Arabic-Indic digits; imported values
// such as الوحدة or التأهيل carry numbers inside the wording. Idempotent, so a caller that
// already converted loses nothing, and JSX values pass through untouched.
const display = (v: ReactNode): ReactNode =>
  typeof v === 'string' || typeof v === 'number' ? toArabicDigits(v) : v;

// One legacy "label on the right, framed value on the left" row.
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-base font-bold text-gray-700 2xl:w-36">{label}</span>
      <span className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-lg font-bold text-gray-900 break-words">
        {value == null || value === '' ? '-' : display(value)}
      </span>
    </div>
  );
}

// A compact label + small framed value, several to a line (legacy الطول/الوزن row).
function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-base font-bold text-gray-700">{label}</span>
      <span className="min-w-[3.5rem] rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center text-lg font-bold text-gray-900">
        {value == null || value === '' ? '-' : display(value)}
      </span>
    </span>
  );
}

function BasicGrid({ h, b, large, committeeType, childrenRows }: { h: any; b: any; large?: boolean; committeeType?: string; childrenRows?: any[] }) {
  const num = (v: any) => (v != null ? toArabicDigits(v) : '-');
  // ملخص الاستيفاء + الوظيفة المؤهلة are tagdded-only concepts; hide them for edarya committees.
  const isTagdded = committeeType === 'tagdded';
  // الأبناء detail (name + DOB): a small table shown under the counts, only when there are
  // recorded children — most officers have none, so an empty table would just be noise.
  // Oldest → youngest order comes from the server (ORDER BY date_birth); attach a computed age.
  const kids = (childrenRows || []).map((k: any) => ({ ...k, age: ageYears(k.date_birth) }));

  // Compact (admin) flavour keeps the dense inline grid.
  if (!large) {
    const fields: [string, any][] = [
      ['الوحدة', h.unit_name || '-'],
      ['الوظيفة', h.job_name || '-'],
      ['التخصص', h.spec_name || '-'],
      ['أعلى تأهيل', b.main_qualify_spec || '-'],
      ['الوزن', num(b.weight)],
      ['الطول', num(b.height)],
      ['زيادة الوزن', num(b.tanasok)],
      ['عدد الأبناء', num(b.boy_no)],
      ['عدد البنات', num(b.girl_no)],
    ];
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1 gap-x-4 text-sm">
          {fields.map(([label, value]) => (
            <div key={label}><span className="text-gray-500">{label}: </span>{display(value)}</div>
          ))}
        </div>
        {clean(b.off_notice) && (
          <div className="text-sm"><span className="text-gray-500">ملاحظة: </span>{display(b.off_notice)}</div>
        )}
        {kids.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-bold text-gray-500">بيانات الأبناء</div>
            <TableBody rows={kids} cols={CHILDREN_COLS} />
          </div>
        )}
      </div>
    );
  }

  // on the right, with the استيفاء summary as a coloured band.
  // استيفاء is imported verbatim now (TARAKY_ESTIFA); tone by whether it reads غير مستوف.
  const estifaText = (b.taraky_estifa as string) || '-';
  // When the استيفاء reads غير مستوف the officer has no qualifying job, so the الوظيفة المؤهلة
  // row below is meaningless and is hidden — the same rule the voting card applies.
  const notMostawf = String(b.taraky_estifa || '').includes('غير مستوف');
  const estifaTone = !b.taraky_estifa
    ? 'border-gray-300 bg-gray-50 text-gray-600'
    : notMostawf
      ? 'border-red-700 bg-red-50 text-red-900'
      : 'border-green-700 bg-green-50 text-green-900';

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-3">
        {/* Qualification/identity fields two-per-line so short values don't stretch across the
            whole width and the tab stays short enough to avoid scrolling. */}
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Row label="الكلية/ المعهد" value={h.faculty ?? b.faculty} />
          <Row label="التخصص" value={h.spec_name} />
          <Row label="أعلى تأهيل" value={b.main_qualify_spec} />
          <Row label="التأهيل المدني" value={b.civil_qualify} />
        </div>

        {isTagdded && (
          <div className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-base font-bold text-gray-700 2xl:w-36">ملخص الاستيفاء</span>
            <span className={`min-w-0 flex-1 rounded-lg border-2 px-3 py-2 text-center text-lg font-bold ${estifaTone}`}>
              {toArabicDigits(estifaText)}
            </span>
          </div>
        )}

        {isTagdded && !notMostawf && <Row label="الوظيفة المؤهلة" value={b.estifa_job} />}

        {/* Short numeric + status values as compact inline metrics — الحالة الاجتماعية/حالة الزوجة
            were full-width rows whose framed value wasted the space to its left. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Metric label="الطول" value={num(b.height)} />
          <Metric label="الوزن" value={num(b.weight)} />
          <Metric label="زيادة الوزن" value={num(b.tanasok)} />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Metric label="الحالة الاجتماعية" value={b.marital_status} />
          <Metric label="حالة الزوجة" value={b.wife_status} />
          <Metric label="عدد الأبناء" value={num(b.boy_no)} />
          <Metric label="عدد البنات" value={num(b.girl_no)} />
        </div>

        {kids.length > 0 && (
          <div className="space-y-2">
            <span className="text-base font-bold text-gray-700">بيانات الأبناء</span>
            <TableBody rows={kids} cols={CHILDREN_COLS} large />
          </div>
        )}
      </div>

      {/* Family photo (legacy FAMILY_PICT): the uploaded image, matched to this officer by
          officer id. Shown with object-contain so the whole photo is visible (family photos
          come in mixed portrait/landscape ratios); a wider column keeps it large. Falls back
          to a framed placeholder when none has been imported. */}
      <div className="hidden">
        {h.id != null ? (
          <OfficerPhoto officerId={h.id} kind="family" label="الصورة العائلية" fit="contain" className="aspect-[4/5] w-full" />
        ) : (
          <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-300 bg-gray-100 text-gray-500">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-12 w-12">
              <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z" />
            </svg>
            <span className="text-base font-bold">الصورة العائلية</span>
          </div>
        )}
      </div>
    </div>
  );
}

// تقارير الكفاءة: the المتوسط summary (legacy KAFAA_AVERAGE — the average commander rating
// plus its grade band, e.g. "جيد جدا (٨٥)") shown above the reports table.
function KafaaSection({ avg, rows, large }: { avg: any; rows: any[]; large?: boolean }) {
  return (
    <div>
      {avg && avg.per != null && (
        <div className={`mb-3 flex flex-wrap items-center gap-2 ${large ? 'text-lg' : 'text-sm'}`}>
          <span className="font-bold text-gray-700">المتوسط</span>
          <span className={`rounded-lg border-2 border-blue-300 bg-blue-50 font-bold text-blue-900 ${large ? 'px-4 py-1.5' : 'px-3 py-1'}`}>
            {[avg.grade, `(${toArabicDigits(avg.per)}%)`].filter(Boolean).join(' ')}
          </span>
        </div>
      )}
      <TableBody rows={rows} cols={KAFAA_COLS} large={large} />
    </div>
  );
}

const clean = (v: any) => {
  const s = v == null ? '' : String(v).trim();
  return s && s !== '-' ? s : '';
};

// Read-only "text area" list: each statement is a framed, filled, non-editable box with a
// larger font for clarity. Used by المحاكمات/الجزاءات and الحالة الصحية — the legacy single
// multi-line TXT / HEALTH_STATUS columns.
function StatementBoxes({ rows, large }: { rows: string[]; large?: boolean }) {
  if (!rows.length) {
    return (
      <div className={large ? 'py-8 text-center text-xl text-gray-700' : 'text-center text-gray-400 py-6'}>
        لا توجد بيانات
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((txt, i) => (
        <div
          key={i}
          className={`w-full rounded-lg border-2 border-gray-300 bg-gray-50 font-bold leading-relaxed text-gray-900 break-words whitespace-pre-wrap ${
            large ? 'px-4 py-3 text-xl' : 'px-3 py-2 text-lg'
          }`}
        >
          {toArabicDigits(txt)}
        </div>
      ))}
    </div>
  );
}

// المحاكمات/الجزاءات: merged into one table where each entry is a full verbatim statement
// (the date is inline in the text); render each as a read-only text box.
function PunishmentsSection({ punishments, large }: { punishments: any[]; large?: boolean }) {
  const rows = (punishments || []).map((p: any) => clean(p.gaza)).filter(Boolean);
  return <StatementBoxes rows={rows} large={large} />;
}

// الحالة الصحية: stored verbatim (Oracle `se7a`) as one full statement per entry (date inline);
// render each as a read-only text box.
function HealthSection({ health, large }: { health: any[]; large?: boolean }) {
  const rows = (health || []).map((r: any) => clean(r.se7a)).filter(Boolean);
  return <StatementBoxes rows={rows} large={large} />;
}

// الدراسات العلمية / التأهيل الحالي: التأهيل العسكري (each course on its own framed line) then the
// academic-studies table (الدرجة / الموقف / موضوع الدراسة). Both ship denormalized as text.
function StudiesSection({ askary, studies, large }: { askary: any[]; studies: any[]; large?: boolean }) {
  const courses = (askary || []).map((r: any) => clean(r.job_n)).filter(Boolean);
  const labelCls = large ? 'text-lg font-bold text-gray-700' : 'text-sm font-bold text-gray-700';
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className={labelCls}>التأهيل العسكري</div>
        {courses.length ? (
          <div className="space-y-2">
            {courses.map((c, i) => (
              <div
                key={i}
                className={`w-full rounded-lg border-2 border-gray-300 bg-gray-50 font-bold text-gray-900 break-words ${
                  large ? 'px-4 py-3 text-xl' : 'px-3 py-2 text-lg'
                }`}
              >
                {toArabicDigits(c)}
              </div>
            ))}
          </div>
        ) : (
          <div className={large ? 'py-4 text-center text-xl text-gray-700' : 'text-center text-gray-400 py-4'}>
            لا توجد بيانات
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className={labelCls}>الدراسات العلمية</div>
        <TableBody rows={studies} cols={TAHIL_COLS} large={large} />
      </div>
    </div>
  );
}

export interface CvSection { id: string; label: string; content: ReactNode; }

// Build the CV section list from the /evaluations/officer-cv payload. `big` selects the
// roomy member flavour; the compact one is for the admin page. Kept separate from the
// component so the member screen can render the tab bar in its header, away from the body.
export function buildCvSections(data: any, only: 'punishments' | undefined, big: boolean): CvSection[] {
  const h = data?.header || {};
  const b = data?.basic || {};
  return only === 'punishments'
    ? [
        { id: 'geza_mo7akma', label: 'المحاكمات/الجزاءات', content: <PunishmentsSection punishments={data?.punishments} large={big} /> },
      ]
    : [
        { id: 'basic', label: 'البيانات الأساسية', content: <BasicGrid h={h} b={b} large={big} committeeType={data?.committee_type} childrenRows={data?.children} /> },
        { id: 'photos', label: 'الصور', content: <PhotosSection key={h.id} officerId={h.id} /> },
        { id: 'jobs', label: 'الوظائف السابقة', content: <TableBody rows={data?.jobs} cols={JOBS_COLS} large={big} /> },
        { id: 'kafaa', label: 'تقارير الكفاءة', content: <KafaaSection avg={data?.kafaa_avg} rows={data?.kafaa} large={big} /> },
        { id: 'paasat', label: 'البعثات والمأموريات', content: <TableBody rows={data?.paasat} cols={PAASAT_COLS} large={big} /> },
        { id: 'studies', label: 'الدراسات العلمية / التأهيل الحالي', content: <StudiesSection askary={data?.tahil_3askary} studies={data?.tahil_3lmy} large={big} /> },
        { id: 'geza_mo7akma', label: 'المحاكمات/الجزاءات', content: <PunishmentsSection punishments={data?.punishments} large={big} /> },
        { id: 'health', label: 'الحالة الصحية', content: <HealthSection health={data?.health} large={big} /> },
      ];
}

// The section tab bar. Large targets that wrap onto as many rows as needed instead of
// hiding sections behind a horizontal scroll — the same treatment wherever it appears.
export function CvTabs({ sections, active, onChange, className = '' }: {
  sections: CvSection[]; active: number; onChange: (i: number) => void; className?: string;
}) {
  return (
    <div role="tablist" className={`flex flex-wrap gap-3 ${className}`}>
      {sections.map((s, i) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={i === active}
          onClick={() => onChange(i)}
          className={`min-h-[56px] rounded-xl border-2 px-6 py-2 text-xl font-bold transition-colors ${
            i === active
              ? 'border-blue-900 bg-blue-800 text-white'
              : 'border-gray-400 bg-white text-gray-900 hover:bg-gray-100'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// Renders the officer CV sections from the /evaluations/officer-cv payload.
// tabbed: show sections as tabs; otherwise stack them (admin full-CV page).
// Empty sections always render a "لا توجد بيانات" message.
export default function OfficerCvContent({ data, only, tabbed }: {
  data: any; only?: 'punishments'; tabbed?: boolean;
}) {
  const [active, setActive] = useState(0);
  if (!data) return <div className="text-center text-gray-400 py-10">لا توجد بيانات</div>;
  const big = Boolean(tabbed);
  const sections = buildCvSections(data, only, big);

  if (tabbed) {
    const idx = Math.min(active, sections.length - 1);
    return (
      <div>
        <CvTabs sections={sections} active={idx} onChange={setActive} className="mb-4 border-b-2 border-gray-300 pb-2" />
        <h4 className="mb-2 text-xl font-bold text-gray-900">{sections[idx].label}</h4>
        <div>{sections[idx].content}</div>
      </div>
    );
  }

  return (
    <>
      {sections.map(s => (
        <div key={s.id} className="mb-4">
          <div className="text-sm font-bold text-gray-700 mb-2">{s.label}</div>
          {s.content}
        </div>
      ))}
    </>
  );
}
