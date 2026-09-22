import VoteOptionGrid from './VoteOptionGrid';
import { useVoteLayout, type VoteChoice } from './voteOptions';

interface Props {
  title: string;
  decisionLabel?: string;
  committee: any;
  officer: any;
  myVote: any;
  isCommander: boolean;
  voting: boolean;
  pendingVote: { opinion: number } | null;
  error: string;
  onVote: (opinion: number) => void;
}

const sameChoice = (c: VoteChoice, v: { opinion: number }) => c.opinion === v.opinion;

// The dominant panel of the screen: the large decision targets. The member's standing
// vote is shown by the checkmark on the chosen button and nothing else.
export default function VotingPanel({
  title, decisionLabel, committee, officer, myVote, isCommander, voting, pendingVote,
  error, onVote,
}: Props) {
  const layout = useVoteLayout(committee, officer);
  const closed = officer.done === 1;
  const opinion = myVote?.user_opinion;

  const isSelected = (c: VoteChoice) => opinion === c.opinion;
  const isSaving = (c: VoteChoice) => pendingVote != null && sameChoice(c, pendingVote);

  const gridProps = {
    selected: isSelected,
    saving: isSaving,
    disabled: voting,
    onSelect: (c: VoteChoice) => onVote(c.opinion),
  };

  return (
    <section
      aria-label={title}
      aria-busy={voting}
      className="rounded-xl border-4 border-blue-200 bg-white shadow-lg"
    >
      <h2 className="rounded-t-lg border-b-2 border-blue-100 bg-blue-50 px-4 py-2 text-center text-xl font-bold text-blue-900">
        {title}
      </h2>

      <div className="space-y-3 p-4">
        {/* Transient alert: the parent clears it after a few seconds, so there is no
            manual dismiss control. */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border-2 border-red-700 bg-red-50 px-3 py-2 text-center text-base font-bold text-red-900"
          >
            {error}
          </div>
        )}

        {decisionLabel && !closed && (
          <p className="rounded-lg bg-slate-700 px-3 py-2 text-center text-lg font-bold text-white">
            {decisionLabel}
          </p>
        )}

        {closed ? (
          <p className="rounded-lg border-2 border-gray-400 bg-gray-100 px-4 py-4 text-center text-xl font-bold text-gray-800">
            تم إغلاق التصويت على هذا الضابط
          </p>
        ) : (
          <VoteOptionGrid choices={layout.choices} columns={layout.columns} {...gridProps} />
        )}
      </div>
    </section>
  );
}
