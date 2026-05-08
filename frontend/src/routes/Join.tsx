import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export default function Join() {
  const { code = '' } = useParams();
  const [name, setName] = useState('');
  const navigate = useNavigate();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    sessionStorage.setItem(`room:${code}:name`, name.trim());
    navigate(`/controller/${code}`);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <p className="text-sm uppercase tracking-widest text-white/40">Joining</p>
        <h1 className="mt-1 text-4xl font-extrabold">{code}</h1>
      </header>

      <form className="space-y-4" onSubmit={submit}>
        <label className="block">
          <span className="text-sm text-white/70">Your name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            className="mt-1 w-full rounded-lg bg-surface px-3 py-2 outline-none ring-1 ring-white/10 focus:ring-accent"
            placeholder="e.g. Mohammed"
          />
        </label>
        <Button type="submit" className="w-full" disabled={!name.trim()}>
          Join
        </Button>
      </form>
    </main>
  );
}
