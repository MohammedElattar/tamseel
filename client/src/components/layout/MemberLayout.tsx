import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MemberCommitteeContext, MemberCommitteeInfo, MemberViewer } from '../../context/memberCommittee';
import { toArabicDigits } from '../../utils/format';
import KashidaLine from '../KashidaLine';

// The nav link names the running committee: لجنة التمثيل العسكري + its training year (from the
// committee's training_year). Falls back to a generic label until the dashboard reports which
// committee (if any) is live.
function committeeNavLabel(committee: MemberCommitteeInfo | null): string {
  if (!committee) return 'اللجنة الحالية';
  const year = committee.training_year != null ? ` ${toArabicDigits(committee.training_year)}` : '';
  return `لجنة التمثيل العسكري${year}`;
}

// The seated member's identity: the seat's position on the top line, then the person's
// "الرتبة / الاسم" under it — the second line only appears once a real name (distinct from the
// position) is set for the seat. Nothing is shown until the dashboard reports the viewer.
function viewerLines(viewer: MemberViewer | null, fallbackName: string, roleLabel: string): [string, string] | null {
  if (!viewer) return null;
  const job = viewer.job_title || '';
  const name = viewer.display_name || fallbackName;
  const personLine = name && name !== job ? [viewer.rank_name, name].filter(Boolean).join(' / ') : '';
  return [job || personLine || roleLabel, job ? personLine : ''];
}

// Shared nav-tab styling for the member header.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-[44px] items-center rounded-lg px-4 py-1 text-base font-bold transition-colors ${
    isActive ? 'bg-green-700 text-white' : 'text-green-100 hover:bg-green-800'
  }`;

export default function MemberLayout() {
  const { user, logout, isGuest, isCommander } = useAuth();
  const navigate = useNavigate();
  const [committee, setCommittee] = useState<MemberCommitteeInfo | null>(null);
  const [viewer, setViewer] = useState<MemberViewer | null>(null);
  const navLabel = committeeNavLabel(committee);
  const roleLabel = isCommander
    ? (user?.username === 'EVAL1' ? 'القائد' : 'نائب القائد')
    : 'عضو اللجنة';
  const identity = viewerLines(viewer, user?.display_name || '', roleLabel);
  // Kashida (Justify High) stretch is applied only for the قائد القوات البحرية seat.
  const kashida = user?.username === 'EVAL1';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Normal document flow with a viewport floor: content is never clipped, so browser zoom
  // and long judicial text stay reachable by scrolling the page itself.
  return (
    // On large screens the shell is exactly one viewport tall and never scrolls; any tall
    // column scrolls within itself instead. Below lg it falls back to normal page scroll.
    <MemberCommitteeContext.Provider value={{ committee, setCommittee, viewer, setViewer }}>
    <div className="member-ui flex min-h-[100dvh] flex-col bg-gray-50 lg:h-[100dvh] lg:overflow-hidden">
      <header className="no-print bg-green-900 text-white shadow-lg">
        {/* Three parts: nav on the start, the seated member's identity centered (equal flex-1
            sides keep it truly centred), and logout on the end. A guest holds no seat, so it
            keeps the app name there instead. */}
        <div className="mx-auto flex max-w-[1700px] items-center gap-4 px-4 py-2">
          <div className="flex flex-1 items-center">
            <nav className="flex items-center gap-2">
              <NavLink to="/member" end className={navLinkClass}>
                {navLabel}
              </NavLink>
              {/* شاشة التصويت: a spectator voting-progress display, shown only for the زائر seat. */}
              {isGuest && (
                <NavLink to="/member/voting-screen" className={navLinkClass}>
                  شاشة التصويت
                </NavLink>
              )}
            </nav>
          </div>
          {isGuest ? (
            <h1 className="shrink-0 text-center text-xl font-bold">قيادة القوات البحرية - فرع شئون ضباط</h1>
          ) : identity && (
            // Sizes to its content but never below a comfortable minimum: short lines still get room
            // to stretch (kashida) to the minimum width, while a long name widens the box to fit it
            // instead of spilling out. (The kashida fill undershoots, so this never feeds back.)
            <div className="w-fit min-w-[28rem] max-w-full shrink-0 text-center">
              <KashidaLine text={toArabicDigits(identity[0])} enabled={kashida} className="text-2xl font-bold leading-tight whitespace-nowrap" />
              {identity[1] && (
                <KashidaLine text={toArabicDigits(identity[1])} enabled={kashida} className="text-2xl font-bold leading-tight whitespace-nowrap" />
              )}
            </div>
          )}
          <div className="flex flex-1 items-center justify-end">
            <button
              onClick={handleLogout}
              className="min-h-[44px] rounded-lg border-2 border-green-300 px-4 py-1 text-base font-bold text-green-50 transition-colors hover:bg-green-800"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </header>
      {/* Flex column so the screen inside can claim the leftover viewport height. */}
      <main className="flex w-full flex-1 flex-col px-4 py-3 lg:min-h-0">
        <Outlet />
      </main>
      <footer className="no-print shrink-0 border-t border-gray-200 bg-white py-2 text-center text-xs text-gray-500">
        تم التطوير بواسطة فرع النظم — الإصدار ١.٠
      </footer>
    </div>
    </MemberCommitteeContext.Provider>
  );
}
