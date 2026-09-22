import { toArabicDigits } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';
import OfficerPhoto from './OfficerPhoto';

interface Props {
  committee: any;
  officer: any;
}

// Legacy FRAME1062 "ملخص استيفاء الضابط" from the tagdded voting form: the استيفاء verdict
// (مستوف / غير مستوف, computed by Get_Off_Taraky_Estifa_num) plus the warning notes the form
// raised beside it (TXT_MOH/TXT_GOOD... — محاكمة/جزاء، تقدير جيد، اللياقة الطبية، الرغبة،
// فرقة القادة). All of it already ships in officer.tagdded; it was just never shown.
function EstifaSummary({ tagdded, isCommander }: { tagdded: any; isCommander: boolean }) {
  const summary = (tagdded.estifa_summary as string) || '';
  const job = (tagdded.qualifying_job as string) || '';
  const ind = tagdded.indicators || {};
  // الحالة الصحية (se7a), محاكمة / جزاء (mohakma_geza) and تقرير الكفاءة (kafaa_takreer) each get
  // their own labelled row (blue label / red value), grouped just beneath the الوظيفة المؤهلة row.
  // القيادة (kyada) follows as a red value on its own — no label.
  const health = (ind.teby as string) || '';
  const mohakma = (ind.mohakma as string) || '';
  const takreer = (ind.takreer as string) || '';
  const kyada = (ind.kyada as string) || '';
  // الرغبة (ragba) is a red value-only note.
  const raghba = (ind.raghba as string) || '';
  // رغبة الضابط + رأي قائد الوحدة في الرغبة: RA8BA_TWSIA arrives as one sentence joining the
  // officer's referral desire and the unit commander's opinion with the conjunction "و" (e.g.
  // "…الاحاله والقائد لا يوصي بالاحالة"). Split on that connecting و — a whitespace-preceded waw,
  // so words like "يوصي" stay intact — into the desire (shown to everyone) and the commander's
  // opinion (commander seats only). The التقاعد variant has no "و", so it is desire-only.
  const ragbaFull = ((ind.tawsya as string) || '').trim();
  const ragbaSplit = ragbaFull.match(/\s+و/);
  const officerDesire = ragbaSplit ? ragbaFull.slice(0, ragbaSplit.index!).trim() : ragbaFull;
  const commanderRagba = ragbaSplit ? ragbaFull.slice(ragbaSplit.index! + ragbaSplit[0].length).trim() : '';

  // When the proposal reads غير مستوف (e.g. "الضابط غير مستوفي") the officer has no qualifying
  // job, so the الوظيفة المؤهلة row below is meaningless and is hidden.
  const notMostawf = summary.includes('غير مستوف');

  // Colour the proposal by its own wording so the tone always matches the sentence shown.
  const summaryTone = !summary
    ? 'border-slate-300 bg-slate-50 text-slate-500'
    : notMostawf
      ? 'border-red-700 bg-red-50 text-red-900'
      : 'border-green-700 bg-green-50 text-green-900';

  return (
    <section aria-label="ملخص استيفاء الضابط" className="rounded-xl border-2 border-slate-300 bg-white">
      <div className="space-y-2 p-3">
        {/* مقترح الاستيفاء (legacy TEXT_ESTIFA): the استيفاء proposal sentence. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 shrink-0 text-sm font-bold text-slate-600 2xl:w-32">الإستيفاء</span>
          <span className={`min-w-0 flex-1 rounded-lg border-2 px-3 py-1.5 text-base font-bold break-words ${summaryTone}`}>
            {toArabicDigits(summary) || 'غير محدد'}
          </span>
        </div>
        {/* الوظيفة المؤهلة (legacy wazefa_mo2ahela): the qualifying job, or لا يكن. Hidden when
            the استيفاء proposal reads غير مستوف — a non-qualifying officer has no qualifying job. */}
        {!notMostawf && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-bold text-slate-600 2xl:w-32">الوظيفة المؤهلة</span>
            <span className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-base font-bold text-slate-900 break-words">
              {toArabicDigits(job) || 'لا يكن'}
            </span>
          </div>
        )}
        {/* الحالة الصحية (legacy se7a): label in blue, the value in red, shown directly beneath
            the الوظيفة المؤهلة row. Dropped when the officer has none. */}
        {health && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-bold text-blue-700 2xl:w-32">الحالة الصحية</span>
            <span className="min-w-0 flex-1 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-1.5 text-base font-bold text-red-700 break-words">
              {toArabicDigits(health)}
            </span>
          </div>
        )}
        {/* محاكمة / جزاء (legacy mohakma_geza): same labelled row as الحالة الصحية. Dropped when empty. */}
        {mohakma && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-bold text-blue-700 2xl:w-32">محاكمة / جزاء</span>
            <span className="min-w-0 flex-1 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-1.5 text-base font-bold text-red-700 break-words">
              {toArabicDigits(mohakma)}
            </span>
          </div>
        )}
        {/* تقرير الكفاءة (legacy kafaa_takreer): same labelled row as الحالة الصحية. Dropped when empty. */}
        {takreer && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-bold text-blue-700 2xl:w-32">تقرير الكفاءة</span>
            <span className="min-w-0 flex-1 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-1.5 text-base font-bold text-red-700 break-words">
              {toArabicDigits(takreer)}
            </span>
          </div>
        )}
        {/* القيادة (legacy kyada): the value only, shown in red with no label. Dropped when empty. */}
        {kyada && (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-1.5 text-base font-bold text-red-700 break-words">
            {toArabicDigits(kyada)}
          </div>
        )}
        {/* الرغبة (ragba): the value only, shown in red with no label. Dropped when empty. */}
        {raghba && (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-1.5 text-base font-bold text-red-700 break-words">
            {toArabicDigits(raghba)}
          </div>
        )}
        {/* رغبة الضابط (first half of RA8BA_TWSIA): the officer's referral desire. Shown to
            everyone who sees the card. Dropped only when the officer has no value at all. */}
        {officerDesire && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-bold text-slate-600 2xl:w-32">رغبة الضابط</span>
            <span className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-base font-bold text-slate-900 break-words">
              {toArabicDigits(officerDesire)}
            </span>
          </div>
        )}
        {/* رأي قائد الوحدة في الرغبة (second half, after the connecting و): the unit commander's
            opinion on that desire. Confidential — rendered only for the commander seats, and only
            when the sentence actually carried a commander clause (the التقاعد value has none), so
            for every other viewer, or when absent, neither the label nor the value appears. */}
        {isCommander && commanderRagba && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-bold text-slate-600 2xl:w-32">رأي قائد الوحدة</span>
            <span className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-base font-bold text-slate-900 break-words">
              {toArabicDigits(commanderRagba)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// [label, value, warn?]
type Fact = [string, any, boolean?];

const isFilled = ([, value]: Fact) => value != null && value !== '';

// One labelled fact. `grow` lets the measurements row split its width evenly across the line.
function FactChip({ label, value, warn, grow }: {
  label: string; value: any; warn?: boolean; grow?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 rounded-lg border px-3 py-1 ${
        grow ? 'min-w-0 flex-1' : ''
      } ${warn ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}
    >
      <dt className={`text-sm font-bold ${warn ? 'text-red-900' : 'text-slate-600'}`}>{label}</dt>
      <dd className={`min-w-0 text-base font-bold break-words ${warn ? 'text-red-900' : 'text-slate-900'}`}>
        {toArabicDigits(value)}
      </dd>
    </div>
  );
}

// The centre column and the visual focus of the screen: who the officer is, plus the facts
// the legacy canvas prints around the portrait — أقدمية، وحدة، وظيفة، تخصص، نوع، then
// الطول / الوزن / الفرق / أعلى تأهيل — in one card. For a judicial committee the case file
// follows underneath. It flows with the page — no inner scrollbox — so browser zoom and
// long judicial text stay reachable with the one scrollbar the member already understands.
export default function OfficerDataCard({ officer }: Props) {
  // ملحق علي is confidential: it renders only for the commander seats (EVAL1/EVAL9). Every other
  // viewer — members, guests, the spectator display — never sees the label or the value.
  const { isCommander } = useAuth();
  const d = officer.tagdded || {};
  const num = (v: any) => (v != null ? toArabicDigits(v) : null);
  const seniority =
    [toArabicDigits(officer.akdam_no), toArabicDigits(officer.akdam_rep || '')].filter(Boolean).join(' ') || '-';

  // [label, value, warn?] — empty values are dropped, so a judicial officer simply gets
  // fewer chips instead of a grid of dashes.
  const facts: Fact[] = ([
    ['الأقدمية', seniority],
    ['الوحدة', officer.unit_name],
    ['الوظيفة', officer.job_name],
    ['التخصص', d.spec_name],
    ['النوع', d.branch],
    ['أعلى تأهيل', d.highest_tahil],
  ] as Fact[]).filter(isFilled);

  // The three body measurements are single numbers, so they share one row instead of taking
  // three cells of the two-column grid. edarya carries none of them and the row disappears.
  const measures: Fact[] = ([
    ['الطول', num(d.height)],
    ['الوزن', num(d.weight)],
    // Legacy fitness flag: weight + 100 - height at or above 15 is a concern.
    ['الفرق', num(d.tanasok), d.tanasok != null && d.tanasok >= 15],
  ] as Fact[]).filter(isFilled);

  return (
    // Slate, where every other card on the screen is white: the officer under evaluation
    // is the one panel a member should never have to look for.
    <section
      aria-label="بيانات الضابط"
      className="overflow-hidden rounded-xl border-2 border-slate-400 bg-slate-50 shadow-sm lg:flex lg:h-full lg:min-h-0 lg:flex-col"
    >
      <div className="bg-slate-700 p-3 lg:shrink-0">
        {officer.taraky_n && (
          <p className="mb-1 text-center">
            <span className="inline-block rounded-full bg-white px-4 py-0.5 text-base font-bold text-slate-800">
              {toArabicDigits(officer.taraky_n)}
            </span>
          </p>
        )}
        <p className="text-center text-2xl font-bold leading-tight text-white break-words">
          {toArabicDigits([officer.rank_name, officer.officer_name].filter(Boolean).join(' / '))}
        </p>
      </div>

      {/* On lg the card is height-capped by the voting grid, so the body scrolls in place
          (identity header stays pinned above it); below lg it flows with the page. */}
      <div className="space-y-3 p-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
        {/* Two columns of facts, with the portrait as a third column on the left. The
            frame is always there — an officer with no photo on file shows a placeholder —
            so the card keeps its shape as the commander moves down the list. */}
        <div className="flex items-start gap-3">
          {/* Left column: the officer's facts, then the summary card beneath them with a
              clear gap — استيفاء for tagdded, بيانات الحالة for edarya — so both branches
              fill the space beside the portrait the same way. The portrait stays on the left. */}
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-[49px]">
            <div className="space-y-2">
              <dl className="grid content-start grid-cols-1 gap-2 sm:grid-cols-2">
                {facts.map(([label, value, warn]) => (
                  <FactChip key={label} label={label} value={value} warn={warn} />
                ))}
              </dl>

              {/* ملحق علي (elhaq_unit): the unit the officer is attached to, shown right after
                  أعلى تأهيل — only to the commander seats, and only when the officer actually has a
                  value. For any other viewer, or when it's empty, neither the label nor the value
                  renders at all. A present value always carries the warning highlight. */}
              {isCommander && officer.elhaq_unit && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-28 shrink-0 text-sm font-bold text-slate-600 2xl:w-32">ملحق علي</span>
                  <span className="min-w-0 flex-1 rounded-lg border-2 border-amber-700 bg-amber-50 px-3 py-1.5 text-base font-bold text-amber-950 break-words">
                    {toArabicDigits(officer.elhaq_unit)}
                  </span>
                </div>
              )}

              {measures.length > 0 && (
                <dl className="flex flex-wrap gap-2">
                  {measures.map(([label, value, warn]) => (
                    <FactChip key={label} label={label} value={value} warn={warn} grow />
                  ))}
                </dl>
              )}
            </div>

            <EstifaSummary tagdded={d} isCommander={isCommander} />
          </div>

          <div className="flex w-[17rem] shrink-0 flex-col gap-2">
            <OfficerPhoto
              officerId={officer.officer_id}
              className="aspect-[3/4] w-full"
            />
            {/* الانتداب: highlighted as a warning banner under the portrait — a "رأي جهة الانتداب"
                label above the value, so a seconded officer is impossible to miss while voting. */}
            {d.entedab && (
              <div className="rounded-lg border-2 border-amber-500 bg-amber-200/75 px-3 py-2 text-center break-words">
                <p className="mb-1 text-base font-bold text-amber-900">رأي جهة الانتداب</p>
                <p className="text-sm font-bold text-amber-800">{toArabicDigits(d.entedab)}</p>
              </div>
            )}
          </div>
        </div>

        {/* ملاحظة (off_notice): a general officer note, pinned to the very bottom of the card's
            own scroll area so even a long note only scrolls and never overflows the layout. */}
        {officer.off_notice && String(officer.off_notice).trim() && (
          <div className="rounded-lg border border-slate-300 bg-white px-3 py-2">
            <span className="text-sm font-bold text-slate-600">ملاحظة: </span>
            <span className="text-base font-bold text-slate-900 break-words">{toArabicDigits(officer.off_notice)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
