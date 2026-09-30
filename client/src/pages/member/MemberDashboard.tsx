import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrent, castVote, advanceOfficer, saveScores } from '../../api/evaluations';
import { useAuth } from '../../context/AuthContext';
import { useMemberCommittee } from '../../context/memberCommittee';
import TamseelVotingScreen from '../../components/member/TamseelVotingScreen';
import GuestViewScreen from '../../components/member/GuestViewScreen';
import MemberTopBar from '../../components/member/MemberTopBar';
import MemberActionBar from '../../components/member/MemberActionBar';
import MemberStateScreen from '../../components/member/MemberStateScreen';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';

export default function MemberDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingVote, setPendingVote] = useState<{ opinion: number } | null>(null);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(false);
  const { user, isCommander, isGuest, logout } = useAuth();
  const navigate = useNavigate();
  // Held in a ref so fetchCurrent stays stable (avoids resetting the poll timer).
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const fetchCurrent = useCallback(async () => {
    try {
      const d = await getCurrent();
      // A committee started that this seat isn't part of → sign out and return to the
      // login screen, whose seat list now shows only the active committee's members.
      if (d?.excluded) {
        logoutRef.current();
        navigate('/login', { replace: true });
        return;
      }
      setData(d);
      // A new active committee clears any stale "finished" view from a previous session.
      if (d?.committee) setFinished(false);
    } catch {
      // keep the last snapshot on transient poll errors
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Realtime: refetch on server push; keep a slow poll as a safety net.
  useLiveUpdates(fetchCurrent);
  useEffect(() => {
    fetchCurrent();
    const t = setInterval(fetchCurrent, 20000);
    return () => clearInterval(t);
  }, [fetchCurrent]);

  const committee = data?.committee;
  const officer = data?.activeOfficer;
  const myVote = data?.myVote;
  const progress = data?.progress;
  const tally = data?.tally;
  const viewer = data?.viewer;

  // Surface the committee to the layout navbar, which names the running committee (a tagdded
  // committee is named by its نشرة month/year, so pass nashra_date).
  const { setCommittee, setViewer } = useMemberCommittee();
  useEffect(() => {
    setCommittee(
      committee
        ? {
            committee_type: committee.committee_type,
            nashra_date: committee.nashra_date,
            training_year: committee.training_year,
          }
        : null,
    );
  }, [committee?.committee_type, committee?.nashra_date, committee?.training_year, setCommittee]);

  // The navbar also carries the seated member's own identity (job, rank, name).
  useEffect(() => {
    setViewer(
      viewer
        ? { display_name: viewer.display_name, job_title: viewer.job_title, rank_name: viewer.rank_name }
        : null,
    );
  }, [viewer?.display_name, viewer?.job_title, viewer?.rank_name, setViewer]);

  // An error is cleared when the officer case changes or when the next action succeeds.
  const caseKey = officer ? `${officer.officer_id}:${officer.ta3n_type ?? ''}` : '';
  const lastCaseKey = useRef(caseKey);
  useEffect(() => {
    if (lastCaseKey.current !== caseKey) {
      lastCaseKey.current = caseKey;
      setError('');
    }
  }, [caseKey]);

  // Alerts are transient: show for 3 seconds, then hide themselves.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const handleVote = async (opinion: number) => {
    if (!data?.activeOfficer) return;
    const officerId = data.activeOfficer.officer_id;
    const prev = data;
    // Optimistic: reflect the vote instantly, reconcile/revert after the request.
    setData((d: any) => (d ? {
      ...d,
      myVote: { ...(d.myVote || {}), user_opinion: opinion },
    } : d));
    setVoting(true);
    setPendingVote({ opinion });
    setError('');
    try {
      await castVote(officerId, opinion);
      await fetchCurrent();
    } catch (err: any) {
      setData(prev);
      setError(err.response?.data?.error || 'فشل تسجيل التصويت');
    } finally {
      setVoting(false);
      setPendingVote(null);
    }
  };

  // Every member saves their بند scores for the active officer (التمثيل العسكري).
  const handleSaveScores = async (scores: { item_id: number; score: number | null }[]) => {
    if (!data?.activeOfficer) return;
    const officerId = data.activeOfficer.officer_id;
    setSaving(true);
    setError('');
    try {
      await saveScores(officerId, scores);
      await fetchCurrent();
    } catch (err: any) {
      setError(err.response?.data?.error || 'فشل حفظ التقييم');
    } finally {
      setSaving(false);
    }
  };

  const handleAdvance = async (direction: 'next' | 'prev') => {
    setError('');
    try {
      const r = await advanceOfficer(direction);
      if (r?.finished) setFinished(true);
      await fetchCurrent();
    } catch (err: any) {
      setError(err.response?.data?.error || 'تعذر تغيير الضابط');
    }
  };

  if (loading) {
    return <MemberStateScreen title="جاري التحميل..." />;
  }

  if (finished || data?.finished) {
    return (
      <MemberStateScreen
        tone="success"
        title="تم إنهاء اللجنة بنجاح"
        description="تم إغلاق التصويت وإنهاء تقييم جميع الضباط"
      />
    );
  }

  if (!committee) {
    return (
      <MemberStateScreen
        tone="waiting"
        pulse
        title="في انتظار بدء اللجنة"
        description="لم تبدأ جلسة اللجنة بعد — برجاء الانتظار حتى يبدأها المسؤول، وستظهر الشاشة تلقائياً عند البدء."
      />
    );
  }

  const remaining = progress ? progress.total - progress.voted - (progress.apologies || 0) : 0;
  // The commander's full title, used both as the vote panel heading and the decision
  // label above its buttons (mirrors the legacy قائد القوات البحرية voting canvas).
  const commanderName = user?.username === 'EVAL1'
    ? 'السيد قائد القوات البحرية'
    : 'السيد نائب قائد القوات البحرية';
  // The post the active officer is presented for (لشغل وظيفة) — for members, not the guest.
  const jobLine = officer && !isGuest
    ? `لشغل وظيفة${officer.target_job ? ` (${officer.target_job})` : ''}`
    : undefined;

  // Reference screens open as their own page (not a modal), reached from the footer and reusing
  // the OfficerCvScreen layout (ملخص بيانات الضابط).
  const refButtons = officer ? [
    { label: 'ملخص بيانات الضابط', onClick: () => navigate(`/member/officer/${officer.officer_id}`) },
    { label: 'نتيجة مسير الخدمة', onClick: () => navigate(`/member/officer/${officer.officer_id}/service`) },
  ] : [];

  return (
    // A flex column filling the viewport, so the officer card can stretch to the footer.
    // pb-24 clears the fixed footer so the last card is never trapped behind it.
    <div className="mx-auto flex w-full max-w-[1700px] flex-1 flex-col gap-3 pb-24 lg:min-h-0">
      <MemberTopBar
        job={jobLine}
        current={officer?.serial}
        remaining={remaining}
        total={progress?.total ?? 0}
      />

      {!officer ? (
        <MemberStateScreen
          tone="waiting"
          pulse
          title="في انتظار عرض الضابط التالي..."
          description="سيظهر الضابط تلقائياً عند اختياره من إدارة اللجنة"
        />
      ) : (
        <>
          {/* Single committee type: the guest gets a read-only view, everyone else the voting canvas. */}
          {isGuest ? (
            <GuestViewScreen committee={committee} officer={officer} />
          ) : (
            <TamseelVotingScreen
              officer={officer} evalItems={data?.evalItems ?? []}
              isCommander={isCommander} myVote={myVote} saving={saving} voting={voting}
              pendingVote={pendingVote} error={error}
              onSaveScores={handleSaveScores} onVote={handleVote}
              tally={tally} memberVotes={data?.memberVotes ?? []} commanderName={commanderName}
            />
          )}

          <MemberActionBar
            buttons={refButtons}
            nav={isCommander ? {
              nextLabel: officer.has_next ? 'التالي' : 'إنهاء',
              prevDisabled: !officer.has_prev,
              nextDisabled: !officer.has_next && officer.done === 1,
              onPrev: () => handleAdvance('prev'),
              onNext: () => handleAdvance('next'),
            } : undefined}
          />
        </>
      )}
    </div>
  );
}
