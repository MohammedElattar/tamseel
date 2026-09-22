import { useEffect, useRef, useState } from 'react';
import { toArabicDigits } from '../../utils/format';

export interface MemberStatus { user_id: number; name: string; voted: boolean; serial: number; }

// How long the exit animation runs before the row is removed from the list (keep in sync with
// the transition duration on the row).
const EXIT_MS = 500;

interface Row { user_id: number; name: string; exiting: boolean; serial: number; }

// A spectator-safe voting-progress panel: one row per member who hasn't voted on the active
// officer, each labelled "لم يصوّت بعد". The instant a member votes, their row animates away
// (fade + slide + collapse) and is gone — no vote or running result is ever shown, only that a
// vote landed. Fed by the decision-free `memberStatuses` the server sends to the guest seat.
export default function PendingVoters({ statuses }: { statuses: MemberStatus[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const pending = new Set(statuses.filter(s => !s.voted).map(s => s.user_id));
    const infoById = new Map(statuses.map(s => [s.user_id, s] as const));

    setRows(prev => {
      const next: Row[] = prev.map(r => ({ ...r }));
      const byId = new Map(next.map(r => [r.user_id, r] as const));

      // Add members that are (still) pending, or revive a row whose officer just reset so it was
      // mid-exit — cancel that exit instead of dropping and re-adding it.
      for (const s of statuses) {
        if (!s.voted) {
          const existing = byId.get(s.user_id);
          if (!existing) {
            next.push({ user_id: s.user_id, name: s.name, serial: s.serial, exiting: false });
          } else if (existing.exiting) {
            existing.exiting = false;
            const t = timers.current[s.user_id];
            if (t) { clearTimeout(t); delete timers.current[s.user_id]; }
          }
        }
      }

      // Anyone no longer pending (just voted) starts exiting; schedule their removal.
      for (const r of next) {
        const info = infoById.get(r.user_id);
        if (info) { r.name = info.name; r.serial = info.serial; }
        if (!pending.has(r.user_id) && !r.exiting) {
          r.exiting = true;
          if (!timers.current[r.user_id]) {
            timers.current[r.user_id] = setTimeout(() => {
              delete timers.current[r.user_id];
              setRows(cur => cur.filter(x => x.user_id !== r.user_id));
            }, EXIT_MS);
          }
        }
      }
      return next;
    });
  }, [statuses]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const pendingCount = rows.filter(r => !r.exiting).length;

  return (
    <section
      aria-label="الأعضاء الذين لم يصوّتوا بعد"
      className="rounded-xl border-2 border-gray-300 bg-white shadow-sm lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
    >
      <h2 className="flex shrink-0 items-center justify-between gap-2 rounded-t-lg border-b-2 border-gray-200 bg-gray-50 px-3 py-2 text-xl font-bold text-gray-800 2xl:text-2xl">
        <span>في انتظار التصويت</span>
        <span className="min-w-7 rounded-full bg-amber-500 px-2 py-0.5 text-center text-sm font-extrabold text-white">
          {toArabicDigits(pendingCount)}
        </span>
      </h2>

      <div className="max-h-[24rem] overflow-y-auto overscroll-contain p-2 lg:max-h-none lg:min-h-0 lg:flex-1">
        {pendingCount === 0 ? (
          <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 p-4 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-4xl font-black text-green-700">
              ✓
            </span>
            <span className="text-2xl font-bold text-green-700">صوّت جميع الأعضاء</span>
          </div>
        ) : (
          <ul>
            {[...rows].sort((a, b) => a.serial - b.serial).map(r => (
              <li
                key={r.user_id}
                className={`overflow-hidden transition-all duration-500 ease-in-out ${
                  r.exiting
                    ? 'mb-0 max-h-0 -translate-x-4 scale-95 opacity-0'
                    : 'mb-2.5 max-h-32 translate-x-0 scale-100 opacity-100'
                }`}
              >
                <div className="rounded-lg border border-amber-300 border-s-4 border-s-amber-400 bg-amber-50 px-3 py-2.5">
                  <div className="text-lg font-bold leading-tight text-slate-800 break-words 2xl:text-xl">
                    {toArabicDigits(r.name)}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-base font-bold text-amber-700">
                    <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
                    لم يصوّت بعد
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
