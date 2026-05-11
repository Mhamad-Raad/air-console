import { motion, type HTMLMotionProps } from 'framer-motion';
import { playSound } from './audio';
import { pulse, type HapticStrength } from './haptics';
import type { SoundKey } from './tokens';

// In-game button with juice: scale-down on press + sound + haptic. For
// menu/lobby surfaces use components/ui/Button.tsx instead; this one is
// tuned for gameplay where every tap should feel tactile.

type Variant = 'primary' | 'secondary' | 'success' | 'danger';

type Props = HTMLMotionProps<'button'> & {
  variant?: Variant;
  sound?: SoundKey | null;
  haptic?: HapticStrength | null;
};

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-white',
  secondary: 'bg-surface text-white',
  success: 'bg-green-500 text-white',
  danger: 'bg-red-500 text-white',
};

export function Button({
  variant = 'primary',
  sound = 'tap',
  haptic = 'light',
  className = '',
  onPointerDown,
  children,
  ...rest
}: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 600, damping: 25 }}
      onPointerDown={(e) => {
        if (sound) playSound(sound);
        if (haptic) pulse(haptic);
        onPointerDown?.(e);
      }}
      className={`inline-flex items-center justify-center rounded-2xl px-6 py-3 text-lg font-semibold shadow-lg select-none touch-none disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
