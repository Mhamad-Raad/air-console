import type { SoundKey } from './tokens';

// Procedurally synthesise the 10 SoundKey clips so the platform has audio
// out of the box without shipping binary files. Each spec is a tiny score
// (oscillators + envelopes) rendered via OfflineAudioContext, encoded to
// a 16-bit mono WAV, and exposed as an object URL. Swap any key for a
// real sample later by calling loadSoundPack({ correct: '/sfx/...' }).

const SAMPLE_RATE = 44100;

type ToneOpts = {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  endFreq?: number;
};

function tone(
  ctx: BaseAudioContext,
  dest: AudioNode,
  freq: number,
  startTime: number,
  duration: number,
  opts: ToneOpts = {},
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  if (opts.endFreq !== undefined) {
    osc.frequency.linearRampToValueAtTime(opts.endFreq, startTime + duration);
  }
  const attack = opts.attack ?? 0.005;
  const peak = opts.gain ?? 0.4;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0005, startTime + duration);
  osc.connect(gain).connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function noise(
  ctx: BaseAudioContext,
  dest: AudioNode,
  startTime: number,
  duration: number,
  peak = 0.3,
): void {
  const buf = ctx.createBuffer(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0005, startTime + duration);
  src.connect(gain).connect(dest);
  src.start(startTime);
  src.stop(startTime + duration + 0.02);
}

type Spec = { duration: number; build: (ctx: BaseAudioContext, dest: AudioNode) => void };

const specs: Record<SoundKey, Spec> = {
  tap: {
    duration: 0.06,
    build: (ctx, d) => tone(ctx, d, 1200, 0, 0.05, { type: 'square', gain: 0.18 }),
  },
  select: {
    duration: 0.12,
    build: (ctx, d) => {
      tone(ctx, d, 880, 0, 0.05, { type: 'triangle', gain: 0.28 });
      tone(ctx, d, 1320, 0.04, 0.07, { type: 'triangle', gain: 0.28 });
    },
  },
  correct: {
    duration: 0.45,
    build: (ctx, d) => {
      // C5, E5, G5 quick arpeggio
      tone(ctx, d, 523.25, 0.0, 0.12, { type: 'sine', gain: 0.4 });
      tone(ctx, d, 659.25, 0.09, 0.12, { type: 'sine', gain: 0.4 });
      tone(ctx, d, 783.99, 0.18, 0.25, { type: 'sine', gain: 0.45 });
    },
  },
  wrong: {
    duration: 0.4,
    build: (ctx, d) => {
      tone(ctx, d, 440, 0, 0.35, {
        type: 'sawtooth',
        gain: 0.3,
        endFreq: 165,
        attack: 0.01,
      });
    },
  },
  tick: {
    duration: 0.06,
    build: (ctx, d) => tone(ctx, d, 880, 0, 0.05, { type: 'square', gain: 0.22 }),
  },
  tickFinal: {
    duration: 0.18,
    build: (ctx, d) => {
      tone(ctx, d, 660, 0, 0.15, { type: 'square', gain: 0.35 });
      tone(ctx, d, 220, 0, 0.16, { type: 'sine', gain: 0.25 });
    },
  },
  reveal: {
    duration: 0.55,
    build: (ctx, d) => {
      tone(ctx, d, 220, 0, 0.5, {
        type: 'sine',
        gain: 0.35,
        endFreq: 1200,
        attack: 0.04,
      });
      tone(ctx, d, 110, 0, 0.5, {
        type: 'triangle',
        gain: 0.18,
        endFreq: 600,
        attack: 0.04,
      });
    },
  },
  win: {
    duration: 0.9,
    build: (ctx, d) => {
      // C5, E5, G5, C6 fanfare
      tone(ctx, d, 523.25, 0.0, 0.18, { type: 'square', gain: 0.28 });
      tone(ctx, d, 659.25, 0.15, 0.18, { type: 'square', gain: 0.28 });
      tone(ctx, d, 783.99, 0.3, 0.18, { type: 'square', gain: 0.28 });
      tone(ctx, d, 1046.5, 0.45, 0.4, { type: 'square', gain: 0.38 });
      // Bass anchor
      tone(ctx, d, 130.81, 0.0, 0.85, { type: 'triangle', gain: 0.16 });
    },
  },
  lose: {
    duration: 0.6,
    build: (ctx, d) => {
      tone(ctx, d, 523.25, 0.0, 0.18, { type: 'sawtooth', gain: 0.28 });
      tone(ctx, d, 440, 0.16, 0.18, { type: 'sawtooth', gain: 0.28 });
      tone(ctx, d, 349.23, 0.32, 0.28, { type: 'sawtooth', gain: 0.32 });
    },
  },
  stinger: {
    duration: 0.95,
    build: (ctx, d) => {
      // Hi-hat splash + kick + sustained chord
      noise(ctx, d, 0, 0.08, 0.5);
      tone(ctx, d, 80, 0.0, 0.18, {
        type: 'sine',
        gain: 0.55,
        endFreq: 35,
        attack: 0.002,
      });
      tone(ctx, d, 261.63, 0.05, 0.85, { type: 'sawtooth', gain: 0.14 });
      tone(ctx, d, 329.63, 0.05, 0.85, { type: 'sawtooth', gain: 0.14 });
      tone(ctx, d, 392.0, 0.05, 0.85, { type: 'sawtooth', gain: 0.14 });
      tone(ctx, d, 523.25, 0.05, 0.85, { type: 'sawtooth', gain: 0.18 });
    },
  },
};

async function renderSpec(spec: Spec): Promise<Blob> {
  const length = Math.ceil(spec.duration * SAMPLE_RATE);
  // Webkit Safari historically required prefixed OfflineAudioContext, but
  // every browser we target now has the unprefixed one.
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);
  spec.build(ctx, ctx.destination);
  const buffer = await ctx.startRendering();
  return audioBufferToWav(buffer);
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const data = buffer.getChannelData(0);
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLen = data.length * bytesPerSample;
  const headerLen = 44;
  const out = new ArrayBuffer(headerLen + dataLen);
  const view = new DataView(out);
  let p = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  const writeU32 = (v: number) => {
    view.setUint32(p, v, true);
    p += 4;
  };
  const writeU16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  writeStr('RIFF');
  writeU32(headerLen + dataLen - 8);
  writeStr('WAVE');
  writeStr('fmt ');
  writeU32(16);
  writeU16(1); // PCM
  writeU16(numChannels);
  writeU32(sampleRate);
  writeU32(sampleRate * blockAlign);
  writeU16(blockAlign);
  writeU16(bitDepth);
  writeStr('data');
  writeU32(dataLen);
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    p += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}

export async function buildSynthPack(): Promise<Partial<Record<SoundKey, string>>> {
  const entries = await Promise.all(
    (Object.keys(specs) as SoundKey[]).map(async (key) => {
      const blob = await renderSpec(specs[key]);
      return [key, URL.createObjectURL(blob)] as const;
    }),
  );
  return Object.fromEntries(entries) as Partial<Record<SoundKey, string>>;
}
