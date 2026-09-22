import DecisionCard from './DecisionCard';
import VotingPanel from './VotingPanel';
import OfficerDataCard from './OfficerDataCard';
import VoteTallyBox from './VoteTallyBox';
import MemberVotesPanel from './MemberVotesPanel';
import type { VoteTone } from '../../constants/voteTone';

// Shared shape passed from the MemberDashboard container to whichever committee-type
// voting screen is active.
export interface VotingScreenProps {
  committee: any;
  officer: any;
  myVote: any;
  isCommander: boolean;
  voting: boolean;
  pendingVote: { opinion: number } | null;
  error: string;
  onVote: (opinion: number) => void;
  tally: any;
  memberVotes: any[];
  commanderName: string;
}

// tagdded (تجديد وترقي) voting canvas: the right track shows the members' tally, then the
// final decision, then the commander's vote panel (voting last, after reviewing); the officer
// career file is in the centre; the detailed member votes are on the left. Below lg the tracks
// stack in document order.
export default function TagddedVotingScreen({
  committee, officer, myVote, isCommander, voting, pendingVote, error, onVote, tally, memberVotes, commanderName,
}: VotingScreenProps) {
  const finalDecision = officer.final_decision
    ? {
        text: officer.final_decision as string,
        tone: (officer.final_postpone ? 'amber' : officer.final_positive ? 'green' : 'red') as VoteTone,
      }
    : null;

  // القرار السابق في السلسلة (لجنة القائد → تمهيدية → رئيسية) — a commander-only hint. The server
  // sends prelim_level only for EVAL1/EVAL9 and only when a previous chain committee exists.
  const prelimLevel = officer.tagdded?.prelim_level;
  const showPrelim = isCommander && prelimLevel != null;
  const prelimTitle =
    prelimLevel === 2 ? 'قرار لجنة القائد'
      : prelimLevel === 1 ? 'قرار اللجنة التمهيدية'
        : 'قرار اللجنة السابقة';

  return (
    <div className="grid items-start gap-3 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:grid-cols-[19rem_minmax(0,1fr)_15rem] xl:grid-cols-[21rem_minmax(0,1fr)_17rem] 2xl:grid-cols-[23rem_minmax(0,1fr)_19rem]">
      {/* Right track, top→bottom: previous-chain hint (if any), the members' tally, the
          resulting final decision, then the commander's own vote panel last (so the vote is
          cast after reviewing the tally and decision). */}
      <div className="min-w-0 space-y-3 lg:min-h-0 lg:overflow-y-auto">
        {showPrelim && (
          <DecisionCard
            title={prelimTitle}
            value={officer.tagdded?.prelim_decision || 'لا يوجد'}
            empty={!officer.tagdded?.prelim_decision}
          />
        )}
        {isCommander && (
          <VoteTallyBox committeeType={committee.committee_type} ta3nType={officer?.ta3n_type} tally={tally} />
        )}
        {finalDecision && (
          <DecisionCard title="القرار النهائي" value={finalDecision.text} tone={finalDecision.tone} />
        )}
        <VotingPanel
          title={isCommander ? `قرار ${commanderName}` : 'رأي السيد العضو'}
          committee={committee}
          officer={officer}
          myVote={myVote}
          isCommander={isCommander}
          voting={voting}
          pendingVote={pendingVote}
          error={error}
          onVote={onVote}
        />
      </div>

      <div className="min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
        <OfficerDataCard committee={committee} officer={officer} />
      </div>

      <div className="min-w-0 space-y-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        {isCommander && (
          <MemberVotesPanel committeeType={committee.committee_type} officer={officer} memberVotes={memberVotes} />
        )}
      </div>
    </div>
  );
}
