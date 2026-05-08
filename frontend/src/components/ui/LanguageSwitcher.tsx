import { useTranslation } from 'react-i18next';
import { setLocale, type Locale } from '../../i18n';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.language as Locale) ?? 'en';

  const Btn = ({ value, label }: { value: Locale; label: string }) => (
    <button
      onClick={() => setLocale(value)}
      className={`rounded-md px-2 py-1 text-xs transition ${
        current === value ? 'bg-accent text-white' : 'text-white/60 hover:text-white'
      }`}
      aria-pressed={current === value}
    >
      {label}
    </button>
  );

  return (
    <div className={`inline-flex gap-1 rounded-lg bg-surface p-1 ${className}`}>
      <Btn value="en" label={t('language.english')} />
      <Btn value="ar" label={t('language.arabic')} />
    </div>
  );
}
