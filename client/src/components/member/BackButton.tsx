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
      className={`inline-flex min-h-[54px] shrink-0 items-center gap-2 rounded-lg border-2 border-slate-900 bg-slate-700 px-6 py-2 text-lg font-bold text-white transition-colors hover:bg-slate-800 ${className}`}
    >
      {label}
    </button>
  );
}
