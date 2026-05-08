import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';

const nameKey = (code: string) => `air-console:room:${code}:name`;

export default function Join() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const [name, setName] = useState(() => localStorage.getItem(nameKey(code)) ?? '');
  const navigate = useNavigate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem(nameKey(code), trimmed);
    navigate(`/controller/${code}`);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <header className="flex items-start justify-between gap-2">
        <button
          onClick={() => navigate('/')}
          className="rounded-lg bg-surface px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
        >
          <span aria-hidden>←</span> {t('common.back')}
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm uppercase tracking-widest text-white/40">{t('join.joining')}</p>
          <h1 className="mt-1 text-4xl font-extrabold">{code}</h1>
        </div>
        <LanguageSwitcher />
      </header>

      <form className="space-y-4" onSubmit={submit}>
        <label className="block">
          <span className="text-sm text-white/70">{t('join.yourName')}</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            className="mt-1 w-full rounded-lg bg-surface px-3 py-2 outline-none ring-1 ring-white/10 focus:ring-accent"
            placeholder={t('join.namePlaceholder')}
          />
        </label>
        <Button type="submit" className="w-full" disabled={!name.trim()}>
          {t('join.join')}
        </Button>
      </form>
    </main>
  );
}
