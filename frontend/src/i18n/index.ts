import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';
import ckb from './ckb.json';

export type Locale = 'en' | 'ar' | 'ckb';

const LOCALE_KEY = 'air-console:locale';
const RTL_LOCALES: Locale[] = ['ar', 'ckb']; // Sorani Kurdish uses Arabic-derived script
const SUPPORTED: Locale[] = ['en', 'ar', 'ckb'];

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(LOCALE_KEY) as Locale | null;
  if (stored && SUPPORTED.includes(stored)) return stored;
  const lang = navigator.language?.toLowerCase() ?? '';
  if (lang.startsWith('ckb') || lang.startsWith('ku')) return 'ckb';
  if (lang.startsWith('ar')) return 'ar';
  return 'en';
}

export const initialLocale = detectInitialLocale();

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    ckb: { translation: ckb },
  },
  lng: initialLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

applyDirection(initialLocale);

export function setLocale(locale: Locale): void {
  localStorage.setItem(LOCALE_KEY, locale);
  void i18next.changeLanguage(locale);
  applyDirection(locale);
}

export function applyDirection(locale: Locale): void {
  const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = locale;
}

export default i18next;
