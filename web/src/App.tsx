import { useEffect, useState } from 'react';
import type { SessionInfo } from '@integrasi/shared';
import { TerminalPane } from './components/TerminalPane';
import { ApiError, apiFetch } from './lib/api';

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SessionInfo[]>('/api/sessions')
      .then((sessions) => setSession(sessions[0] ?? null))
      .catch((err: unknown) =>
        setError(err instanceof ApiError && err.status === 401 ? 'Token tidak valid' : String(err)),
      );
  }, []);

  async function createSession() {
    setSession(await apiFetch<SessionInfo>('/api/sessions', { method: 'POST', body: '{}' }));
  }

  return (
    <main className="flex h-full flex-col font-sans">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
        <span className="font-semibold">Integrasi AI</span>
        <button
          className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          onClick={() => void createSession()}
        >
          Sesi baru
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </header>
      <section className="min-h-0 flex-1 p-2">
        {session && <TerminalPane key={session.id} sessionId={session.id} active />}
      </section>
    </main>
  );
}
