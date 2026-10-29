import { Fragment, useEffect, useRef, useState } from 'react';
import { ArenaBar } from './components/ArenaBar';
import { ArenaPaneHeader } from './components/ArenaPaneHeader';
import { CompareDialog } from './components/CompareDialog';
import { ExitBanner } from './components/ExitBanner';
import { Icon } from './components/Icon';
import { Logo } from './components/Logo';
import { PreviewPane } from './components/PreviewPane';
import { Sidebar } from './components/Sidebar';
import { Splitter } from './components/Splitter';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { TerminalPane } from './components/TerminalPane';
import { useShortcuts, useWaitingTitle } from './hooks/use-app-chrome';
import { ApiError } from './lib/api';
import { SHORTCUT_HELP } from './lib/shortcuts';
import { useAppStore } from './stores/app-store';
import { arenaOf, useArenaStore } from './stores/arena-store';
import { usePreviewStore } from './stores/preview-store';

export function App() {
  const loaded = useAppStore((s) => s.loaded);
  const error = useAppStore((s) => s.error);
  const notice = useAppStore((s) => s.notice);
  const order = useAppStore((s) => s.order);
  const activeId = useAppStore((s) => s.activeId);
  const active = useAppStore((s) => (s.activeId ? s.sessions[s.activeId] : undefined));
  const sessions = useAppStore((s) => s.sessions);
  const { load, setError, setNotice, applyServerMessage, setConnection } = useAppStore.getState();
  const arenas = useArenaStore((s) => s.arenas);
  const comparing = useArenaStore((s) => s.arenas.find((a) => a.id === s.comparingId));
  const arena = arenaOf(arenas, activeId);
  const arenaLayout = useArenaStore((s) => (arena ? (s.layout[arena.id] ?? 'grid') : 'single'));
  // Side by side: every live contestant of the active arena is on screen at once.
  const sideBySide =
    arena && arenaLayout === 'grid'
      ? arena.entries.map((e) => e.sessionId).filter((id): id is string => !!id && !!sessions[id])
      : [];
  const grid = sideBySide.length > 1;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const previewOpen = usePreviewStore((s) => s.open);
  const previewWidth = usePreviewStore((s) => s.width);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const showPreview = previewOpen && !!active;
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
    useArenaStore
      .getState()
      .load()
      .catch(() => {});
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
        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 border-b border-line bg-panel py-1.5 pr-2 pl-4 text-sm"
          >
            {notice}
            <button className="icon-btn" aria-label="Tutup pesan" onClick={() => setNotice(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
        <TabBar />
        {arena && <ArenaBar arena={arena} />}
        <div ref={workspaceRef} className="flex min-h-0 flex-1">
          <section
            className={`relative min-h-0 min-w-0 flex-1 bg-term ${
              grid
                ? 'grid auto-rows-fr grid-cols-1 gap-px bg-line md:grid-cols-2'
                : 'py-2 pr-1 pl-3'
            }`}
          >
            {order.map((id) => {
              const inGrid = grid && sideBySide.includes(id);
              return (
                <TerminalPane
                  key={id}
                  sessionId={id}
                  active={grid ? inGrid : id === activeId}
                  focused={id === activeId}
                  header={(() => {
                    const entry = inGrid
                      ? arena?.entries.find((e) => e.sessionId === id)
                      : undefined;
                    return (
                      arena &&
                      entry && (
                        <ArenaPaneHeader
                          arena={arena}
                          entry={entry}
                          sessionId={id}
                          focused={id === activeId}
                        />
                      )
                    );
                  })()}
                  onServerMessage={(message) => applyServerMessage(id, message)}
                  onConnectionChange={(state) => setConnection(id, state)}
                />
              );
            })}
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
          {/* Preview needs room next to the terminal; on phones it is not offered. */}
          {showPreview && (
            <>
              <div className="hidden md:flex">
                <Splitter container={workspaceRef} />
              </div>
              <div
                className="hidden min-w-0 shrink-0 md:block"
                style={{ width: `${previewWidth * 100}%` }}
              >
                <PreviewPane />
              </div>
            </>
          )}
        </div>
        {active && <StatusBar session={active} />}
      </main>
      <CompareDialog arena={comparing} />
    </div>
  );
}
