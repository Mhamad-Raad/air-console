// Design tokens shared across every game. Keep this file pure data — no
// React, no side effects. Anything that gives Air Console its identity
// (colors, easings, font scale, sound key vocabulary) lives here so each
// game inherits the same look-and-feel for free.

type Cubic = [number, number, number, number];

export const palette = {
  bg: '#0b0d12',
  surface: '#161922',
  surfaceMuted: '#1f2230',
  accent: '#7c5cff',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  text: '#ffffff',
  textMuted: '#a1a1aa',
} as const;

export const easings: Record<'snap' | 'pop' | 'ease', Cubic> = {
  snap: [0.2, 0.8, 0.2, 1],
  pop: [0.34, 1.56, 0.64, 1],
  ease: [0.4, 0, 0.2, 1],
};

export const durations = {
  instant: 0.08,
  quick: 0.15,
  base: 0.25,
  slow: 0.45,
  stinger: 1.6,
} as const;

// Every sound the platform knows how to play. Each game uses these keys
// instead of file paths so swapping the sound pack changes the whole
// platform's audio identity at once.
export type SoundKey =
  | 'tap'
  | 'select'
  | 'correct'
  | 'wrong'
  | 'tick'
  | 'tickFinal'
  | 'reveal'
  | 'win'
  | 'lose'
  | 'stinger';
