import type { ButtonHTMLAttributes } from 'react';

type Tone = 'sky' | 'amber' | 'emerald' | 'neutral';

const ACTIVE: Record<Tone, string> = {
  sky: 'bg-sky-500/80 text-white border-sky-400',
  amber: 'bg-amber-500/80 text-white border-amber-400',
  emerald: 'bg-emerald-500/80 text-white border-emerald-400',
  neutral: 'bg-white/20 text-white border-white/30',
};
const INACTIVE = 'bg-white/5 text-white/50 hover:bg-white/10 border-white/10';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tone?: Tone;
}

/**
 * Toggle pill button. Used for team A/B selection and any other
 * "click to toggle, color reflects state" interaction.
 */
export function Pill({ active = false, tone = 'neutral', className = '', ...rest }: Props) {
  const styles = active ? ACTIVE[tone] : INACTIVE;
  return (
    <button
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${styles} ${className}`}
      aria-pressed={active}
      {...rest}
    />
  );
}
