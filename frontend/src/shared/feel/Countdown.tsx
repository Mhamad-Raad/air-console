import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { playSound } from './audio';

type Props = {
  seconds: number;
  onComplete?: () => void;
  tickFromSecond?: number;
  className?: string;
};

// Counts down once per second, animating each tick. Plays `tick` in the
// final stretch and `tickFinal` on the last second. Resets when `seconds`
// changes, so passing a new value restarts the timer cleanly.
export function Countdown({
  seconds,
  onComplete,
  tickFromSecond = 3,
  className = '',
}: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setRemaining(seconds);
    if (seconds <= 0) {
      onCompleteRef.current?.();
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, seconds - elapsed);
      setRemaining(left);
      if (left > 0 && left <= tickFromSecond) {
        playSound(left === 1 ? 'tickFinal' : 'tick');
      }
      if (left <= 0) {
        window.clearInterval(id);
        onCompleteRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds, tickFromSecond]);

  const urgent = remaining > 0 && remaining <= tickFromSecond;
  return (
    <motion.div
      key={remaining}
      initial={{ scale: urgent ? 1.4 : 1.15, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      className={`tabular-nums font-black ${urgent ? 'text-red-400' : 'text-white'} ${className}`}
    >
      {remaining}
    </motion.div>
  );
}
