import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TerminalPane } from './components/TerminalPane';
import { ApiError } from './lib/api';
import { useAppStore } from './stores/app-store';

export function App() {
  const loaded = useAppStore((s) => s.loaded);
  const error = useAppStore((s) => s.error);
  const order = useAppStore((s) => s.order);
  const activeId = useAppStore((s) => s.activeId);
  const { load, setError, applyServerMessage, setConnection } = useAppStore.getState();

  useEffect(() => {
    load().catch((err: unknown) =>
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Token tidak valid. Buka URL bertoken yang dicetak server di console.'
          : `Gagal memuat: ${String(err)}`,
      ),
    );
  }, [load, setError]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between border-b border-error/30 bg-error/10 px-4 py-2 text-sm text-error"
          >
            {error}
            <button className="icon-btn" aria-label="Tutup pesan" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        )}
        <section className="relative min-h-0 flex-1 bg-[#0d1017] p-2">
          {order.map((id) => (
            <TerminalPane
              key={id}
              sessionId={id}
              active={id === activeId}
              onServerMessage={(message) => applyServerMessage(id, message)}
              onConnectionChange={(state) => setConnection(id, state)}
            />
          ))}
          {loaded && order.length === 0 && (
            <div className="grid h-full place-items-center text-center text-sm text-muted">
              <p>
                Pilih project di sidebar, lalu pilih CLI
                <br />
                untuk membuka sesi terminal.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
