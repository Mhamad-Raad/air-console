import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { RouteHeader } from '../components/ui/RouteHeader';
import type { GameCatalogEntry, Room } from '../types';

export default function Home() {
  const { t } = useTranslation();
  const [games, setGames] = useState<GameCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<GameCatalogEntry[]>('/api/games')
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, []);

  async function start(slug: string) {
    setCreating(slug);
    try {
      const room = await api.post<Room>('/api/rooms', { gameSlug: slug });
      navigate(`/host/${room.code}`);
    } finally {
      setCreating(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <RouteHeader
        center={
          <div className="text-start">
            <h1 className="text-3xl font-bold">{t('common.appName')}</h1>
            <p className="mt-2 text-white/60">{t('home.tagline')}</p>
          </div>
        }
      />

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {loading && <p className="text-white/60">{t('common.loading')}</p>}
        {!loading &&
          games.map((g) => (
            <article key={g.slug} className="rounded-xl bg-surface p-6">
              <h2 className="text-xl font-semibold">{g.name}</h2>
              <p className="mt-1 text-sm text-white/60">{g.description}</p>
              <p className="mt-2 text-xs text-white/40">
                {t('home.playersRange', { min: g.minPlayers, max: g.maxPlayers })}
              </p>
              <Button
                className="mt-4 w-full"
                disabled={creating === g.slug}
                onClick={() => start(g.slug)}
              >
                {creating === g.slug ? t('home.creating') : t('home.start')}
              </Button>
            </article>
          ))}
      </section>
    </main>
  );
}
