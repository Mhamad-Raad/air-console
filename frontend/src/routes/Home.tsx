import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import type { GameCatalogEntry, Room } from '../types';

export default function Home() {
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
      <h1 className="text-3xl font-bold">air-console</h1>
      <p className="mt-2 text-white/60">Pick a game. Phones become controllers.</p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {loading && <p className="text-white/60">Loading…</p>}
        {!loading &&
          games.map((g) => (
            <article key={g.slug} className="rounded-xl bg-surface p-6">
              <h2 className="text-xl font-semibold">{g.name}</h2>
              <p className="mt-1 text-sm text-white/60">{g.description}</p>
              <p className="mt-2 text-xs text-white/40">
                {g.minPlayers}–{g.maxPlayers} players
              </p>
              <Button
                className="mt-4 w-full"
                disabled={creating === g.slug}
                onClick={() => start(g.slug)}
              >
                {creating === g.slug ? 'Creating…' : 'Start'}
              </Button>
            </article>
          ))}
      </section>
    </main>
  );
}
