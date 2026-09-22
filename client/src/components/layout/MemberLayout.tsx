import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MemberCommitteeContext, MemberCommitteeInfo } from '../../context/memberCommittee';
import { toArabicDigits } from '../../utils/format';

// The nav link names the running committee: لجنة التمثيل العسكري + its training year (from the
// committee's training_year). Falls back to a generic label until the dashboard reports which
// committee (if any) is live.
function committeeNavLabel(committee: MemberCommitteeInfo | null): string {
  if (!committee) return 'اللجنة الحالية';
  const year = committee.training_year != null ? ` ${toArabicDigits(committee.training_year)}` : '';
  return `لجنة التمثيل العسكري${year}`;
}

// Shared nav-tab styling for the member header.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-[44px] items-center rounded-lg px-4 py-1 text-base font-bold transition-colors ${
    isActive ? 'bg-green-700 text-white' : 'text-green-100 hover:bg-green-800'
  }`;

export default function MemberLayout() {
  const { logout, isGuest } = useAuth();
  const navigate = useNavigate();
  const [committee, setCommittee] = useState<MemberCommitteeInfo | null>(null);
  const navLabel = committeeNavLabel(committee);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Normal document flow with a viewport floor: content is never clipped, so browser zoom
  // and long judicial text stay reachable by scrolling the page itself.
  return (
    // On large screens the shell is exactly one viewport tall and never scrolls; any tall
    // column scrolls within itself instead. Below lg it falls back to normal page scroll.
    <MemberCommitteeContext.Provider value={{ committee, setCommittee }}>
    <div className="member-ui flex min-h-[100dvh] flex-col bg-gray-50 lg:h-[100dvh] lg:overflow-hidden">
      {/* The seated member's own name lives in the screen header below, next to the
          session counters, so this bar stays a thin chrome strip. */}
      <header className="no-print bg-green-900 text-white shadow-lg">
        {/* Three parts: nav on the start, the app name centered (equal flex-1 sides keep it
            truly centred), and logout on the end. */}
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
          <h1 className="shrink-0 text-center text-xl font-bold">قيادة القوات البحرية - فرع شئون ضباط</h1>
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
