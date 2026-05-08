import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

export type Locale = 'en' | 'ar';

const LOCALE_KEY = 'air-console:locale';
const RTL_LOCALES: Locale[] = ['ar'];

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(LOCALE_KEY) as Locale | null;
  if (stored === 'ar' || stored === 'en') return stored;
  // Default to Arabic if the browser language hints at it; otherwise English.
  const lang = navigator.language?.toLowerCase() ?? '';
  return lang.startsWith('ar') ? 'ar' : 'en';
}

export const initialLocale = detectInitialLocale();

void i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
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
