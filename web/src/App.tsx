import { Fragment, useEffect, useState } from 'react';
import { ExitBanner } from './components/ExitBanner';
import { Icon } from './components/Icon';
import { Logo } from './components/Logo';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useShortcuts();
  useWaitingTitle();

  // On narrow screens the sidebar is a drawer: close it once a session is picked.
  useEffect(() => setSidebarOpen(false), [activeId]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setSidebarOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

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
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-2 py-1.5 md:hidden">
          <button
            className="icon-btn"
            aria-label="Buka sidebar"
            aria-controls="sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Logo size={18} />
            Pangkalan
          </span>
        </header>
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b border-error/30 bg-error/10 py-1.5 pr-2 pl-4 text-sm text-error"
          >
            {error}
            <button className="icon-btn" aria-label="Tutup pesan" onClick={() => setError(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        <TabBar />
        <section className="relative min-h-0 flex-1 bg-term py-2 pl-3 pr-1">
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
            <div className="grid h-full place-items-center overflow-y-auto px-4 text-sm text-muted">
              <div className="max-w-sm">
                <p className="text-lg font-semibold text-fg">Belum ada sesi terbuka</p>
                <p className="mt-1.5 leading-relaxed">
                  Klik project di sidebar, lalu pilih CLI untuk membuka terminal di foldernya.
                </p>
                <h2 className="mt-8 mb-2 text-xs font-medium text-fg">Shortcut</h2>
                <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 border-t border-line pt-3 text-xs">
                  {SHORTCUT_HELP.map(([keys, label]) => (
                    <Fragment key={keys}>
                      <dt>
                        <kbd className="rounded border border-line-strong bg-panel px-1.5 py-0.5 font-mono text-[11px] text-fg">
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
        {active && <StatusBar session={active} />}
      </main>
    </div>
  );
}
