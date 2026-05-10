type Tone = 'on' | 'off' | 'warn';

interface Props {
  on?: boolean;
  /** Overrides the on/off coloring with a third state (e.g. disconnected). */
  tone?: Tone;
  label?: string;
  size?: 'sm' | 'md';
}

/**
 * Small colored dot indicating a binary status — green/grey for ready,
 * amber for transient states like "disconnected, awaiting reconnect".
 */
export function StatusDot({ on = false, tone, label, size = 'md' }: Props) {
  const dim = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const resolved: Tone = tone ?? (on ? 'on' : 'off');
  const color =
    resolved === 'on'
      ? 'bg-emerald-400'
      : resolved === 'warn'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-white/20';
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${dim} ${color}`}
      aria-label={label}
    />
  );
}
