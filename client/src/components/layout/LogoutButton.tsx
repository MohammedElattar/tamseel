// Logout for the app headers: a solid red button with a "leave" icon so it stands out against the
// dark header bars. The arrow exits the door frame toward the screen edge (left, in RTL).
export default function LogoutButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border-2 border-red-800 bg-red-600 font-bold text-white shadow-md transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300 ${
        compact ? 'px-3 py-1.5 text-sm' : 'min-h-[48px] px-4 py-2 text-lg'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={compact ? 'h-5 w-5' : 'h-6 w-6'}
      >
        <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
        <path d="M9 17l-5-5 5-5" />
        <path d="M4 12h11" />
      </svg>
      تسجيل الخروج
    </button>
  );
}
