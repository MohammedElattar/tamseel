import { TONE_BUTTON, type VoteTone } from '../../constants/voteTone';

interface Props {
  label: string;
  tone: VoteTone;
  selected: boolean;
  saving: boolean;
  disabled: boolean;
  onClick: () => void;
}

// One large decision target. Selection is signalled by a checkmark badge, a heavier
// border and an offset ring — never by colour alone.
export default function VoteButton({ label, tone, selected, saving, disabled, onClick }: Props) {
  const t = TONE_BUTTON[tone] ?? TONE_BUTTON.green;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-busy={saving}
      className={[
        'relative flex h-full min-h-[68px] w-full flex-col items-center justify-center',
        'rounded-xl border-2 px-3 py-2 text-center font-bold transition-colors',
        'disabled:cursor-not-allowed',
        selected ? t.selected : t.idle,
        selected ? `ring-2 ring-offset-2 ring-offset-white ${t.ring}` : '',
        disabled && !selected ? 'opacity-60' : '',
      ].join(' ')}
    >
      {selected && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-lg leading-none text-gray-900 shadow"
        >
          ✓
        </span>
      )}
      <span className="block w-full text-xl leading-snug break-words">{label}</span>
      {/* The chosen option is marked by the checkmark and ring alone. Only the in-flight
          save adds a line, and it fits inside min-h so the button never changes size. */}
      {saving && <span className="block text-sm leading-6">جاري الحفظ…</span>}
    </button>
  );
}
