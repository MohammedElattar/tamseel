// A decision button's colour family. Previously sourced from the edarya ta3n config; now
// defined here since the app has a single committee type with fixed vote choices.
export type VoteTone = 'green' | 'red' | 'amber' | 'orange' | 'rose';

// A decision's colour comes from the tone the admin picked for its option, never from the
// opinion integer — the integers are configurable, so every vote surface reads these maps.
export type ToneOrNeutral = VoteTone | 'neutral';

// Solid fills chosen for >=4.5:1 contrast against their label colour. Amber keeps its
// warning identity with a dark label instead of unreadable white text.
export const TONE_BUTTON: Record<VoteTone, { idle: string; selected: string; ring: string }> = {
  green: {
    idle: 'bg-green-700 hover:bg-green-800 text-white border-green-900',
    selected: 'bg-green-800 text-white border-green-950',
    ring: 'ring-green-700',
  },
  red: {
    idle: 'bg-red-700 hover:bg-red-800 text-white border-red-900',
    selected: 'bg-red-800 text-white border-red-950',
    ring: 'ring-red-700',
  },
  amber: {
    idle: 'bg-amber-400 hover:bg-amber-500 text-amber-950 border-amber-700',
    selected: 'bg-amber-500 text-amber-950 border-amber-800',
    ring: 'ring-amber-700',
  },
  orange: {
    idle: 'bg-orange-700 hover:bg-orange-800 text-white border-orange-900',
    selected: 'bg-orange-800 text-white border-orange-950',
    ring: 'ring-orange-700',
  },
  rose: {
    idle: 'bg-rose-800 hover:bg-rose-900 text-white border-rose-950',
    selected: 'bg-rose-900 text-white border-black',
    ring: 'ring-rose-800',
  },
};

// Pale framed variant for read-only decision boxes.
export const TONE_CARD: Record<ToneOrNeutral, string> = {
  neutral: 'border-gray-300 bg-gray-50 text-gray-900',
  green: 'border-green-700 bg-green-50 text-green-900',
  red: 'border-red-700 bg-red-50 text-red-900',
  amber: 'border-amber-700 bg-amber-50 text-amber-950',
  orange: 'border-orange-700 bg-orange-50 text-orange-900',
  rose: 'border-rose-800 bg-rose-50 text-rose-900',
};

// Text-only colour for tallies, breakdowns and table cells.
export const TONE_TEXT: Record<ToneOrNeutral, string> = {
  neutral: 'text-gray-800',
  green: 'text-green-700',
  red: 'text-red-700',
  amber: 'text-amber-700',
  orange: 'text-orange-600',
  rose: 'text-rose-800',
};

// Bolder text colour for the per-member vote list, which sits on a white card.
export const TONE_TEXT_STRONG: Record<ToneOrNeutral, string> = {
  neutral: 'text-gray-800',
  green: 'text-green-800',
  red: 'text-red-800',
  amber: 'text-amber-800',
  orange: 'text-orange-800',
  rose: 'text-rose-900',
};

// Full-row highlight for the per-member vote list: a tinted background + a thick start bar in
// the vote colour, with a dark high-contrast label. Tuned to be readable at a glance (older
// viewers), so each member is unmistakably tagged with the colour they voted.
export const TONE_ROW: Record<ToneOrNeutral, string> = {
  neutral: 'bg-gray-50 border-gray-300 text-gray-700',
  green: 'bg-green-100 border-green-600 text-green-900',
  red: 'bg-red-100 border-red-600 text-red-900',
  amber: 'bg-amber-100 border-amber-600 text-amber-950',
  orange: 'bg-orange-100 border-orange-600 text-orange-900',
  rose: 'bg-rose-100 border-rose-700 text-rose-900',
};

// Printed reports set explicit rgb() so the colour survives the print stylesheet.
export const TONE_PRINT: Record<ToneOrNeutral, string> = {
  neutral: 'rgb(0,0,0)',
  green: 'rgb(0,100,0)',
  red: 'rgb(200,0,0)',
  amber: 'rgb(200,110,0)',
  orange: 'rgb(210,90,0)',
  rose: 'rgb(190,0,150)',
};

export function toneOf(tone: string | null | undefined): ToneOrNeutral {
  return tone && tone in TONE_CARD ? (tone as ToneOrNeutral) : 'neutral';
}
