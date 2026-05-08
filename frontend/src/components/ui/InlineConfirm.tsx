import { useEffect } from 'react';

interface Props {
  message: string;
  yes: string;
  no: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Auto-cancel after N ms of inactivity. Default 4000. 0 disables. */
  autoCancelMs?: number;
  variant?: 'danger' | 'neutral';
}

/**
 * In-place confirm dialog (replaces native window.confirm).
 * Used for kick, leave-room, end-game, etc.
 */
export function InlineConfirm({
  message,
  yes,
  no,
  onConfirm,
  onCancel,
  autoCancelMs = 4000,
  variant = 'danger',
}: Props) {
  useEffect(() => {
    if (!autoCancelMs) return;
    const t = setTimeout(onCancel, autoCancelMs);
    return () => clearTimeout(t);
  }, [autoCancelMs, onCancel]);

  const yesClass =
    variant === 'danger'
      ? 'bg-red-500/80 hover:bg-red-500 text-white'
      : 'bg-accent text-white hover:opacity-90';

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{message}</span>
      <span className="flex shrink-0 gap-2">
        <button
          onClick={onConfirm}
          className={`rounded px-3 py-1 text-xs font-medium transition ${yesClass}`}
        >
          {yes}
        </button>
        <button
          onClick={onCancel}
          className="rounded bg-white/10 px-3 py-1 text-xs text-white/70 transition hover:bg-white/20"
        >
          {no}
        </button>
      </span>
    </div>
  );
}
