import confetti, { type Options } from 'canvas-confetti';

export type CelebrationIntensity = 'small' | 'big' | 'epic';

// One call, three intensities. `small` for a correct answer, `big` for
// a round win, `epic` (Jackbox-style staggered burst) for end-of-game.
export function celebrate(intensity: CelebrationIntensity = 'small'): void {
  if (intensity === 'small') {
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    return;
  }
  if (intensity === 'big') {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    return;
  }
  const fire = (p: number, opts: Options) =>
    confetti({ ...opts, origin: { y: 0.6 }, particleCount: Math.floor(220 * p) });
  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1, { spread: 120, startVelocity: 45 });
}
