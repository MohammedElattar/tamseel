import { createContext, useContext } from 'react';

// Bridges the active committee (type + date) from the member dashboard (which fetches it)
// up to the surrounding MemberLayout navbar, so the nav link can name the committee — a
// tagdded committee is named "مشروع التجديد و الترقى" + its نشرة month/year, which needs nashra_date.
export interface MemberCommitteeInfo {
  committee_type: string;
  nashra_date?: string | null;
  training_year?: number | null;
}

interface MemberCommitteeCtx {
  committee: MemberCommitteeInfo | null;
  setCommittee: (committee: MemberCommitteeInfo | null) => void;
}

export const MemberCommitteeContext = createContext<MemberCommitteeCtx>({
  committee: null,
  setCommittee: () => {},
});

export const useMemberCommittee = () => useContext(MemberCommitteeContext);
