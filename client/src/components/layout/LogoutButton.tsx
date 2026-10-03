// Logout for the app headers: a solid red X button so it stands out against the dark header bars.
export default function LogoutButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="تسجيل الخروج"
      title="تسجيل الخروج"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-red-800 bg-red-600 text-white shadow-md transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300 ${
        compact ? 'h-9 w-9' : 'h-12 w-12'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={compact ? 'h-6 w-6' : 'h-8 w-8'}
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  );
}
