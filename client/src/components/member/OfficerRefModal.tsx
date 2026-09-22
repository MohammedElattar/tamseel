import { useEffect, useState } from 'react';
import { getOfficerJoblevel, getOfficerShare7a } from '../../api/evaluations';
import { toArabicDigits } from '../../utils/format';
import MemberModal from './MemberModal';

// On-demand reference views from the commander/member voting screen:
//   joblevel = المستويات الوظيفية (kin_c=2 job-level ladder, current level highlighted)
//   share7a  = ضباط الشريحة (peer officers in the same bulletin slice, ranked by total)
export default function OfficerRefModal({ officerId, mode, onClose }: {
  officerId: number; mode: 'joblevel' | 'share7a'; onClose: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (mode === 'joblevel' ? getOfficerJoblevel(officerId) : getOfficerShare7a(officerId))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [officerId, mode]);

  const title = mode === 'joblevel' ? 'المستويات الوظيفية' : 'ضباط الشريحة';

  return (
    <MemberModal title={title} width={mode === 'share7a' ? 'wide' : 'medium'} onClose={onClose}>
      {loading ? (
        <div className="py-10 text-center text-xl text-gray-700">جاري التحميل...</div>
      ) : mode === 'joblevel' ? (
        <Joblevel data={data} />
      ) : (
        <Share7a data={data} />
      )}
    </MemberModal>
  );
}

const CELL = 'border-2 border-gray-300 px-3 py-2';
const HEAD = 'border-2 border-gray-400 bg-gray-100 px-3 py-2 text-base font-bold text-gray-900';

function Joblevel({ data }: { data: any }) {
  const levels: any[] = data?.levels || [];
  const cur = data?.currentLevel;
  if (!levels.length) return <div className="py-10 text-center text-xl text-gray-700">لا توجد بيانات</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr>
            <th className={HEAD}>م</th>
            <th className={HEAD}>المستوى الوظيفى</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((l, i) => (
            <tr key={l.level_c} className={l.level_c === cur ? 'bg-yellow-100 font-bold' : ''}>
              <td className={`${CELL} text-center`}>{toArabicDigits(i + 1)}</td>
              <td className={CELL}>
                {l.level_n}{l.level_c === cur ? ' (المستوى الحالي)' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Share7a({ data }: { data: any }) {
  const peers: any[] = data?.peers || [];
  if (!peers.length) {
    return <div className="py-10 text-center text-xl text-gray-700">لا يوجد ضباط في نفس الشريحة</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-base">
        <thead>
          <tr>
            {['اسبقية في الشريحة', 'الأقدمية', 'الرتبة', 'الاسم', 'الإجمالي', 'الاستيفاء'].map(h => (
              <th key={h} className={HEAD}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {peers.map((p) => (
            <tr
              key={p.officer_id}
              className={p.is_current ? 'bg-yellow-100 font-bold'
                : p.estifa === 0 ? 'text-red-800' : p.estifa === 1 ? 'text-green-800' : ''}
            >
              <td className={`${CELL} text-center`}>{toArabicDigits(p.order)}</td>
              <td className={`${CELL} text-center`}>{toArabicDigits(p.akdam) || '-'}</td>
              <td className={`${CELL} text-center`}>{toArabicDigits(p.rank_name)}</td>
              <td className={CELL}>{toArabicDigits(p.per_name)}</td>
              <td className={`${CELL} text-center`}>{toArabicDigits(p.total)}</td>
              <td className={`${CELL} text-center`}>
                {p.estifa === 1 ? 'مستوف' : p.estifa === 0 ? 'غير مستوف' : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
