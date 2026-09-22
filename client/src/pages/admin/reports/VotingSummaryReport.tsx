import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getVotingSummary } from '../../../api/committees';
import ReportPage from '../../../components/reports/ReportPage';
import { toArabicDigits } from '../../../utils/format';
import { useLiveUpdates } from '../../../hooks/useLiveUpdates';

// user_opinion -> printed marker (1=for/P, 0=against/O, else blank)
const voteMarker = (opinion: number | null | undefined) =>
  opinion === 1 ? 'P' : opinion === 0 ? 'O' : '';

interface Member { user_id: number; serial: number; name_snapshot: string; rank_snapshot: string; username: string }
interface Officer {
  officer_id: number; serial: number; akdam_no: number | null; akdam_rep: string | null;
  rank_name: string; officer_name: string; l_lagna_type_c: number | null;
  taraky_n: string | null; final_eval: number | null; decision: string;
}
interface Vote { officer_id: number; user_id: number; user_opinion: number | null }

export default function VotingSummaryReport() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ committee: any; members: Member[]; officers: Officer[]; votes: Vote[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(() => {
    return getVotingSummary(Number(id)).then(setData).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useLiveUpdates(fetchSummary);

  const members = data?.members ?? [];
  const officers = data?.officers ?? [];
  const votes = data?.votes ?? [];

  // rows are a fixed 1..N grid; members are placed at their serial
  const rowCount = Math.max(11, ...members.map(m => m.serial));
  const memberBySerial = new Map(members.map(m => [m.serial, m]));

  const voteFor = (officerId: number, userId: number) =>
    votes.find(v => v.officer_id === officerId && v.user_id === userId)?.user_opinion;

  return (
    <ReportPage loading={loading}>
      <div className="grid grid-cols-2 gap-2 p-2">
        {officers.map(officer => (
          <div key={officer.officer_id} className="border-2 border-black flex flex-col text-[10px]">
            {/* header: title + officer + photo */}
            <div className="flex border-b-2 border-black">
              <div className="flex-1 px-1 py-1">
                <div className="text-center font-bold text-[12px]">
                  {toArabicDigits(officer.taraky_n || '')}
                </div>
                <div className="flex justify-between items-end mt-1 font-bold">
                  <span>{toArabicDigits(officer.akdam_no ?? '')}{officer.akdam_rep ? ` ${toArabicDigits(officer.akdam_rep)}` : ''}</span>
                  <span>{toArabicDigits([officer.rank_name, officer.officer_name].filter(Boolean).join(' / '))}</span>
                </div>
              </div>
              <div className="w-[2cm] h-[2cm] border-r-2 border-black bg-white shrink-0" />
            </div>

            {/* members x committees table */}
            <table className="w-full border-collapse text-[9px]">
              <thead>
                <tr className="font-bold">
                  <th className="border border-black py-0.5" style={{ width: '6%' }}>م</th>
                  <th className="border border-black py-0.5" style={{ width: '55%' }}>العضو</th>
                  <th className="border border-black py-0.5" style={{ width: '13%' }}>لجنة القائد</th>
                  <th className="border border-black py-0.5" style={{ width: '13%' }}>التمهيدية</th>
                  <th className="border border-black py-0.5" style={{ width: '13%' }}>الرئيسية</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rowCount }, (_, i) => i + 1).map(n => {
                  const member = memberBySerial.get(n);
                  const opinion = member ? voteFor(officer.officer_id, member.user_id) : undefined;
                  return (
                    <tr key={n} className={n === 1 ? 'bg-blue-200' : ''}>
                      <td className="border border-black text-center">{toArabicDigits(n)}</td>
                      <td className="border border-black px-1 text-right">{toArabicDigits(member?.name_snapshot || '')}</td>
                      <td className="border border-black text-center">{/* commander committee */}</td>
                      <td className="border border-black text-center">{/* preliminary committee */}</td>
                      <td className="border border-black text-center">{member ? voteMarker(opinion) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* footer: page no + decisions */}
            <div className="flex justify-between items-start mt-auto p-1 gap-2">
              <div className="text-center">
                <div className="font-bold mb-0.5">رقم الصفحة</div>
                <div className="border border-black px-3 py-0.5 min-w-[2cm]">
                  {toArabicDigits(officer.serial)}
                </div>
              </div>
              <div className="flex flex-col gap-0.5 items-end">
                <div className="flex items-center gap-1">
                  <span className="border border-black px-2 py-0.5 min-w-[3cm] text-center">
                    {toArabicDigits(officer.decision) || 'لم تعقد'}
                  </span>
                  <span className="font-bold">قرار اللجنة الرئيسية</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="border border-black px-2 py-0.5 min-w-[3cm] text-center">لم تعقد</span>
                  <span className="font-bold">قرار اللجنة التمهيدية</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {officers.length === 0 && !loading && (
        <div className="text-center text-gray-400 py-10">لا يوجد ضباط في اللجنة</div>
      )}
    </ReportPage>
  );
}
