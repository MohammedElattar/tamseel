import { useState, useEffect, useCallback } from 'react';
import { getCurrent } from '../../api/evaluations';
import { useMemberCommittee } from '../../context/memberCommittee';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import MemberStateScreen from '../../components/member/MemberStateScreen';
import DisplayOfficerCard from '../../components/member/DisplayOfficerCard';
import PendingVoters from '../../components/member/PendingVoters';

// شاشة التصويت: a spectator voting-progress display. It shows the officer the committee has
// active and the members still owed a vote (each vanishing the moment they vote), fed by the
// decision-free `memberStatuses` the server sends to the زائر seat — never a vote or result.
export default function VotingDisplayScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrent = useCallback(async () => {
    try {
      setData(await getCurrent());
    } catch {
      // keep the last snapshot on transient poll errors
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime on server push, with a slow poll as a safety net (mirrors MemberDashboard).
  useLiveUpdates(fetchCurrent);
  useEffect(() => {
    fetchCurrent();
    const t = setInterval(fetchCurrent, 20000);
    return () => clearInterval(t);
  }, [fetchCurrent]);

  const committee = data?.committee;
  const officer = data?.activeOfficer;

  // Keep the layout navbar's committee label in sync while this screen is open.
  const { setCommittee } = useMemberCommittee();
  useEffect(() => {
    setCommittee(
      committee ? { committee_type: committee.committee_type, nashra_date: committee.nashra_date } : null,
    );
  }, [committee?.committee_type, committee?.nashra_date, setCommittee]);

  if (loading) return <MemberStateScreen title="جاري التحميل..." />;
  if (!committee) {
    return (
      <MemberStateScreen
        tone="waiting"
        pulse
        title="في انتظار بدء اللجنة"
        description="لم تبدأ جلسة اللجنة بعد — ستظهر شاشة التصويت تلقائياً عند البدء."
      />
    );
  }
  if (!officer) {
    return (
      <MemberStateScreen
        tone="waiting"
        pulse
        title="في انتظار عرض الضابط التالي..."
        description="سيظهر الضابط تلقائياً عند اختياره من إدارة اللجنة"
      />
    );
  }

  return (
    // Two tracks: في انتظار التصويت pinned to the right (RTL → first grid child), the officer
    // identity + photo/facts filling the rest to the left.
    <div className="mx-auto grid w-full max-w-[1700px] flex-1 grid-cols-1 gap-3 pb-4 lg:min-h-0 lg:grid-cols-[26rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch xl:grid-cols-[28rem_minmax(0,1fr)] 2xl:grid-cols-[30rem_minmax(0,1fr)]">
      <div className="min-w-0 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        <PendingVoters statuses={data?.memberStatuses ?? []} />
      </div>

      <div className="min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
        <DisplayOfficerCard committee={committee} officer={officer} />
      </div>
    </div>
  );
}
