import { Fragment, useEffect } from 'react';
import { ExitBanner } from './components/ExitBanner';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { TerminalPane } from './components/TerminalPane';
import { useShortcuts, useWaitingTitle } from './hooks/use-app-chrome';
import { ApiError } from './lib/api';
import { SHORTCUT_HELP } from './lib/shortcuts';
import { useAppStore } from './stores/app-store';

export function App() {
  const loaded = useAppStore((s) => s.loaded);
  const error = useAppStore((s) => s.error);
  const order = useAppStore((s) => s.order);
  const activeId = useAppStore((s) => s.activeId);
  const active = useAppStore((s) => (s.activeId ? s.sessions[s.activeId] : undefined));
  const { load, setError, applyServerMessage, setConnection } = useAppStore.getState();
  useShortcuts();
  useWaitingTitle();

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
        <TabBar />
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
          {active && active.exitCode !== null && <ExitBanner key={active.id} session={active} />}
          {loaded && order.length === 0 && (
            <div className="grid h-full place-items-center text-sm text-muted">
              <div className="max-w-sm text-center">
                <p className="text-fg">Belum ada sesi terbuka</p>
                <p className="mt-1">
                  Klik project di sidebar, lalu pilih CLI untuk membuka terminal di foldernya.
                </p>
                <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-left text-xs">
                  {SHORTCUT_HELP.map(([keys, label]) => (
                    <Fragment key={keys}>
                      <dt>
                        <kbd className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-fg">
                          {keys}
                        </kbd>
                      </dt>
                      <dd>{label}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
