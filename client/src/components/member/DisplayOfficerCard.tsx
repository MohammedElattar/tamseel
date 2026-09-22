import OfficerPhoto from './OfficerPhoto';
import { toArabicDigits } from '../../utils/format';

interface Props {
  committee: any;
  officer: any;
}

// A stripped-down officer card for the projector شاشة التصويت: the identity banner (promotion
// badge + الرتبة / الاسم) on top, then the portrait with الأقدمية / الوحدة / الوظيفة / التخصص.
// Everything else the full OfficerDataCard shows (استيفاء, medical/leadership notes, measurements,
// الانتداب, case file …) is intentionally omitted — this is a public committee-status board.
export default function DisplayOfficerCard({ committee, officer }: Props) {
  const isTagdded = committee.committee_type === 'tagdded';
  // التخصص lives under the branch-specific bundle (tagdded/edarya), same as OfficerDataCard.
  const d = (isTagdded ? officer.tagdded : officer.edarya) || {};
  const seniority =
    [toArabicDigits(officer.akdam_no), toArabicDigits(officer.akdam_rep || '')].filter(Boolean).join(' ') || '-';

  const facts: [string, any][] = ([
    ['الأقدمية', seniority],
    ['الوحدة', officer.unit_name],
    ['الوظيفة', officer.job_name],
    ['التخصص', d.spec_name],
  ] as [string, any][]).filter(([, v]) => v != null && v !== '');

  return (
    <section
      aria-label="بيانات الضابط"
      className="overflow-hidden rounded-xl border-2 border-slate-400 bg-slate-50 shadow-sm lg:flex lg:h-full lg:min-h-0 lg:flex-col"
    >
      {/* Identity banner (same slate header as the full card): promotion badge + الرتبة / الاسم. */}
      <div className="bg-slate-700 p-3 text-center lg:shrink-0">
        {officer.taraky_n && (
          <p className="mb-1">
            <span className="inline-block rounded-full bg-white px-4 py-0.5 text-base font-bold text-slate-800 2xl:text-lg">
              {toArabicDigits(officer.taraky_n)}
            </span>
          </p>
        )}
        <p className="text-2xl font-bold leading-tight text-white break-words 2xl:text-3xl">
          {toArabicDigits([officer.rank_name, officer.officer_name].filter(Boolean).join(' / '))}
        </p>
      </div>

      {/* Body: portrait on the left, the four facts on the right. flex-row-reverse (under RTL)
          puts the first child — the photo — on the left, while the stacked mobile view keeps the
          photo on top. */}
      <div className="flex flex-col items-center gap-6 p-5 lg:min-h-0 lg:flex-1 lg:flex-row-reverse lg:items-center lg:justify-center lg:gap-10">
        <OfficerPhoto
          officerId={officer.officer_id}
          className="aspect-[3/4] w-full max-w-xs shrink-0 2xl:max-w-sm"
        />
        <dl className="grid w-full max-w-lg grid-cols-1 gap-4">
          {facts.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <dt className="w-28 shrink-0 text-lg font-bold text-slate-500 2xl:text-xl">{label}</dt>
              <dd className="min-w-0 flex-1 text-2xl font-bold text-slate-900 break-words 2xl:text-3xl">
                {toArabicDigits(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
