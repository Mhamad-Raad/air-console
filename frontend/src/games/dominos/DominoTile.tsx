// Visual primitive for a single domino tile, drawn as inline SVG so it
// scales crisply on any screen. The engine emits tiles as [Pip, Pip] in
// canonical low/high order; this component just renders pip values and
// has no rules knowledge.

import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';

type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type TilePair = readonly [Pip, Pip];

export interface DominoTileProps {
  tile: TilePair;
  /** Long-axis direction. Doubles look right vertical; everything else horizontal. */
  orientation?: 'horizontal' | 'vertical';
  /** Pixel size of one half-square. A horizontal tile renders as 2S × S. */
  size?: number;
  /** Show a glow ring (e.g. the tile is selected in the controller hand). */
  selected?: boolean;
  /** Dim the tile (e.g. cannot legally be played right now). */
  dimmed?: boolean;
  /** Render a tile back instead of pips — used for opponent hand counts. */
  faceDown?: boolean;
  /** Click handler. When set, the tile gains a hover/tap affordance. */
  onClick?: () => void;
  /** Forwarded ARIA label for accessibility. */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

// Pip layout within a single half, expressed as fractions of the half side.
// Standard double-six positions.
const PIP_POSITIONS: Record<Pip, ReadonlyArray<readonly [number, number]>> = {
  0: [],
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.28, 0.28],
    [0.5, 0.5],
    [0.72, 0.72],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.5, 0.5],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  6: [
    [0.28, 0.22],
    [0.72, 0.22],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.78],
    [0.72, 0.78],
  ],
};

export function DominoTile({
  tile,
  orientation = 'horizontal',
  size = 48,
  selected = false,
  dimmed = false,
  faceDown = false,
  onClick,
  ariaLabel,
  className = '',
  style,
}: DominoTileProps) {
  const horizontal = orientation === 'horizontal';
  const w = horizontal ? size * 2 : size;
  const h = horizontal ? size : size * 2;
  const radius = size * 0.12;
  const pipR = size * 0.085;
  const interactive = !!onClick;

  // The first half sits at the left (horizontal) or top (vertical); the
  // second at the right / bottom.
  const halfATranslate = horizontal ? { x: 0, y: 0 } : { x: 0, y: 0 };
  const halfBTranslate = horizontal ? { x: size, y: 0 } : { x: 0, y: size };

  const dividerProps = horizontal
    ? { x1: size, y1: size * 0.12, x2: size, y2: size - size * 0.12 }
    : { x1: size * 0.12, y1: size, x2: size - size * 0.12, y2: size };

  const label =
    ariaLabel ?? (faceDown ? 'face-down tile' : `domino ${tile[0]} ${tile[1]}`);

  const baseClass = [
    'select-none',
    interactive ? 'cursor-pointer' : '',
    dimmed ? 'opacity-40' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.svg
      role={interactive ? 'button' : 'img'}
      aria-label={label}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={baseClass}
      style={style}
      onClick={onClick}
      whileHover={interactive ? { y: -4, scale: 1.03 } : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
    >
      <defs>
        <linearGradient id="tile-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbf7e6" />
          <stop offset="100%" stopColor="#e8dfbf" />
        </linearGradient>
        <linearGradient id="tile-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1f2e" />
          <stop offset="100%" stopColor="#0c1018" />
        </linearGradient>
        <filter id="tile-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy={size * 0.06}
            stdDeviation={size * 0.05}
            floodOpacity="0.35"
          />
        </filter>
      </defs>

      <g filter="url(#tile-shadow)">
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={radius}
          ry={radius}
          fill={faceDown ? 'url(#tile-back)' : 'url(#tile-face)'}
          stroke={faceDown ? '#0c1018' : '#c9bf99'}
          strokeWidth={1}
        />
        {/* Subtle top highlight for bevel */}
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h * 0.22}
          rx={radius}
          ry={radius}
          fill={faceDown ? '#2a3145' : '#ffffff'}
          opacity={faceDown ? 0.08 : 0.35}
          pointerEvents="none"
        />
      </g>

      {faceDown ? (
        <>
          {/* Decorative crest on the back of the tile */}
          <circle
            cx={w / 2}
            cy={h / 2}
            r={Math.min(w, h) * 0.22}
            fill="none"
            stroke="#3b4561"
            strokeWidth={1.5}
            opacity={0.7}
          />
          <circle
            cx={w / 2}
            cy={h / 2}
            r={Math.min(w, h) * 0.08}
            fill="#3b4561"
            opacity={0.85}
          />
        </>
      ) : (
        <>
          <line
            {...dividerProps}
            stroke="#9a8f63"
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.55}
          />

          <g transform={`translate(${halfATranslate.x} ${halfATranslate.y})`}>
            <Pips value={tile[0]} side={size} radius={pipR} />
          </g>
          <g transform={`translate(${halfBTranslate.x} ${halfBTranslate.y})`}>
            <Pips value={tile[1]} side={size} radius={pipR} />
          </g>
        </>
      )}

      {selected && (
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={radius}
          ry={radius}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={3}
        />
      )}
    </motion.svg>
  );
}

function Pips({
  value,
  side,
  radius,
}: {
  value: Pip;
  side: number;
  radius: number;
}) {
  const positions = PIP_POSITIONS[value];
  return (
    <>
      {positions.map(([fx, fy], i) => (
        <circle
          key={i}
          cx={fx * side}
          cy={fy * side}
          r={radius}
          fill="#1a1d2e"
        />
      ))}
    </>
  );
}
