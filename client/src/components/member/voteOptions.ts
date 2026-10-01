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

// The commander's decision on an officer (لجنة التمثيل العسكري): تصدق / لا يتصدق. Members score
// instead of voting, so these are the only opinions cast.
export const TAGDDED_CHOICES: VoteChoice[] = [
  { label: 'تصدق', tone: 'green', opinion: 1 },
  { label: 'لا يتصدق', tone: 'red', opinion: 0 },
];

// The committee has a single type with a fixed vote set (تصدق / لا يتصدق).
export function useVoteLayout(_committee?: any, _officer?: any): VoteLayout {
  return { choices: TAGDDED_CHOICES };
}
