// Thin wrapper around navigator.vibrate so games call a named strength
// instead of magic numbers. Silently no-ops on platforms without the API
// (desktops, iOS Safari) — caller never has to feature-detect.

export type HapticStrength = 'light' | 'medium' | 'heavy';

const patterns: Record<HapticStrength, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: [30, 40, 30],
};

export function pulse(strength: HapticStrength = 'light'): void {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(patterns[strength]);
}
