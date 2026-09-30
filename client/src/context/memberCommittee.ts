import { createContext, useContext } from 'react';

// Bridges the active committee (type + date) from the member dashboard (which fetches it)
// up to the surrounding MemberLayout navbar, so the nav link can name the committee — a
// tagdded committee is named "مشروع التجديد و الترقى" + its نشرة month/year, which needs nashra_date.
// The seated member's own identity (viewer) travels the same way, for the navbar's centre.
export interface MemberCommitteeInfo {
  committee_type: string;
  nashra_date?: string | null;
  training_year?: number | null;
}

export interface MemberViewer {
  display_name?: string | null;
  job_title?: string | null;
  rank_name?: string | null;
}

interface MemberCommitteeCtx {
  committee: MemberCommitteeInfo | null;
  setCommittee: (committee: MemberCommitteeInfo | null) => void;
  viewer: MemberViewer | null;
  setViewer: (viewer: MemberViewer | null) => void;
}

export const MemberCommitteeContext = createContext<MemberCommitteeCtx>({
  committee: null,
  setCommittee: () => {},
  viewer: null,
  setViewer: () => {},
});

export const useMemberCommittee = () => useContext(MemberCommitteeContext);
