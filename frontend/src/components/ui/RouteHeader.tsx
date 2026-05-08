import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';

interface Props {
  /** Optional click handler for a back button on the leading edge. */
  onBack?: () => void;
  /** Custom label for the back button; defaults to t('common.back'). */
  backLabel?: string;
  /** Centered slot — usually a title block (label above + heading). */
  center?: React.ReactNode;
  /** Whether to show the language switcher. Default: true. */
  showLanguageSwitcher?: boolean;
  className?: string;
}

/**
 * The header shape every route shares: optional back button, center title,
 * language switcher on the trailing edge.
 */
export function RouteHeader({
  onBack,
  backLabel,
  center,
  showLanguageSwitcher = true,
  className = '',
}: Props) {
  const { t } = useTranslation();
  return (
    <header className={`flex w-full items-start justify-between gap-2 ${className}`}>
      {onBack ? (
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
        >
          <span aria-hidden>←</span>
          {backLabel ?? t('common.back')}
        </button>
      ) : (
        <span className="w-0" /> // spacer so center stays centered
      )}

      <div className="flex-1 text-center">{center}</div>

      {showLanguageSwitcher ? <LanguageSwitcher /> : <span className="w-0" />}
    </header>
  );
}
