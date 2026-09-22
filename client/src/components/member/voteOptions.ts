import type { VoteTone } from '../../constants/voteTone';

// One tappable decision. `opinion` is the exact value sent to the vote API.
export interface VoteChoice {
  label: string;
  tone: VoteTone;
  opinion: number;
}

// A vote screen is one grid of choices.
export interface VoteLayout {
  choices: VoteChoice[];
  columns?: 1 | 2 | 3;
}

// Every tagdded committee (رئيسية / تمهيدية / القائد) votes the same opinion set —
// يستمر / يحال / يؤجل, with no numeric grade.
export const TAGDDED_CHOICES: VoteChoice[] = [
  { label: 'يستمر', tone: 'green', opinion: 1 },
  { label: 'يحال', tone: 'red', opinion: 0 },
  { label: 'يؤجل', tone: 'amber', opinion: -1 },
];

// The committee has a single type with a fixed vote set (يستمر / يحال / يؤجل).
export function useVoteLayout(_committee?: any, _officer?: any): VoteLayout {
  return { choices: TAGDDED_CHOICES };
}
