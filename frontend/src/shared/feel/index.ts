// Air Console "feel" package — the shared juice layer every game uses to
// stay visually and audibly part of the same product. Tokens, audio,
// haptics, confetti, and a small set of juiced UI primitives.
//
// Usage:
//   import { Button, playSound, celebrate, Countdown } from '@/shared/feel';

export * from './tokens';
export * from './audio';
export * from './haptics';
export * from './confetti';
export { buildSynthPack } from './synthPack';
export { Button } from './Button';
export { Countdown } from './Countdown';
export { ScoreNumber } from './ScoreNumber';
export { Stinger } from './Stinger';
