import { animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number;
  durationMs?: number;
  className?: string;
};

// Animates from the previous value to the new value with eased count-up.
// "+150 points" lands much harder visually when the score ticks up than
// when it jumps.
export function ScoreNumber({ value, durationMs = 800, className = '' }: Props) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    const controls = animate(from, value, {
      duration: durationMs / 1000,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, durationMs]);

  return <span className={`tabular-nums ${className}`}>{display}</span>;
}
