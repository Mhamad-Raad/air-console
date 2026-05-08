interface Props {
  on: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

/**
 * Small colored dot indicating a binary state.
 * Used for player.isReady today; will work for "online", "their turn", etc.
 */
export function StatusDot({ on, label, size = 'md' }: Props) {
  const dim = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${dim} ${on ? 'bg-emerald-400' : 'bg-white/20'}`}
      aria-label={label}
    />
  );
}
