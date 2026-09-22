type Tone = 'neutral' | 'waiting' | 'success';

const TONES: Record<Tone, string> = {
  neutral: 'border-gray-300',
  waiting: 'border-blue-300',
  success: 'border-green-600',
};

const TITLE_TONES: Record<Tone, string> = {
  neutral: 'text-gray-800',
  waiting: 'text-gray-900',
  success: 'text-green-800',
};

interface Props {
  title: string;
  description?: string;
  tone?: Tone;
  pulse?: boolean;
}

// Every non-voting member state (loading, waiting, finished) shares one calm, legible screen.
export default function MemberStateScreen({ title, description, tone = 'neutral', pulse }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        className={`rounded-xl border-2 bg-white px-6 py-12 text-center shadow-sm ${TONES[tone]}`}
        aria-live="polite"
      >
        {pulse && (
          <span
            aria-hidden="true"
            className="mb-4 inline-flex h-3 w-3 animate-ping rounded-full bg-green-600"
          />
        )}
        <p className={`text-2xl font-bold ${TITLE_TONES[tone]}`}>{title}</p>
        {description && <p className="mt-2 text-base leading-relaxed text-gray-700">{description}</p>}
      </div>
    </div>
  );
}
