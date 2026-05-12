import { Howl } from 'howler';
import type { SoundKey } from './tokens';

// Howler-backed audio with a registry pattern: games never reference file
// paths, they call `playSound('correct')`. A central place (typically
// main.tsx once an audio pack exists) calls `loadSoundPack({...})` to
// wire keys to URLs. Until that happens every playSound() is a no-op,
// which is what we want during scaffolding.

type SoundPack = Partial<Record<SoundKey, string>>;
type LoadOpts = {
  // Howler can't infer extension from a blob/data URL, so callers loading
  // generated audio must pass a format hint (e.g. ['wav']).
  format?: string[];
};

const sounds: Partial<Record<SoundKey, Howl>> = {};
let masterVolume = 0.8;
let muted = false;

export function loadSoundPack(pack: SoundPack, opts: LoadOpts = {}): void {
  for (const key of Object.keys(pack) as SoundKey[]) {
    const src = pack[key];
    if (!src) continue;
    sounds[key] = new Howl({
      src: [src],
      volume: masterVolume,
      ...(opts.format ? { format: opts.format } : {}),
    });
  }
}

export function playSound(key: SoundKey): void {
  if (muted) return;
  sounds[key]?.play();
}

export function setMasterVolume(v: number): void {
  masterVolume = Math.max(0, Math.min(1, v));
  for (const s of Object.values(sounds)) s?.volume(masterVolume);
}

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}
