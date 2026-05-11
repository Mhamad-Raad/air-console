import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { playSound } from './audio';
import { durations } from './tokens';

type Props = {
  show: boolean;
  text: string;
  subtext?: string;
  sound?: 'stinger' | null;
  onDone?: () => void;
  durationMs?: number;
};

// Full-screen banner for round/winner moments. Pops in with overshoot,
// holds, fades. Caller owns the `show` flag; on hide-out completion we
// fire `onDone` so parent can advance state.
export function Stinger({
  show,
  text,
  subtext,
  sound = 'stinger',
  onDone,
  durationMs = durations.stinger * 1000,
}: Props) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!show) return;
    if (sound) playSound(sound);
    const id = window.setTimeout(() => onDoneRef.current?.(), durationMs);
    return () => window.clearTimeout(id);
  }, [show, sound, durationMs]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.6, rotate: -6, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 1.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 16 }}
            className="text-center px-8"
          >
            <div className="text-7xl font-black text-white drop-shadow-lg">{text}</div>
            {subtext && <div className="mt-3 text-xl text-white/70">{subtext}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
