import { useNavigate } from 'react-router-dom';

interface Props {
  to?: string;
  label?: string;
  className?: string;
}

export default function BackButton({ to = '/member', label = 'رجوع', className = '' }: Props) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={`group relative inline-flex min-h-[56px] shrink-0 items-center gap-3 overflow-hidden rounded-xl border-2 border-blue-900 bg-blue-700 py-2 pe-6 ps-2.5 text-xl font-bold text-white shadow-md transition duration-200 ease-out hover:bg-blue-800 hover:shadow-lg active:shadow-sm motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.97] ${className}`}
    >
      {/* Sheen that sweeps across once per hover; it snaps back without animating. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent motion-safe:group-hover:translate-x-[300%] motion-safe:group-hover:transition-transform motion-safe:group-hover:duration-700"
      />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-blue-800 shadow-sm">
        {/* "Back" points right in this RTL layout. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-5 w-5 transition-transform duration-200 ease-out motion-safe:group-hover:translate-x-1"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
      {label}
    </button>
  );
}
