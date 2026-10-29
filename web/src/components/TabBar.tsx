import { useActivePreview } from '../hooks/use-active-preview';
import type { SessionView } from '../stores/app-store';
import { useAppStore } from '../stores/app-store';
import { usePreviewStore } from '../stores/preview-store';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { StatusDot } from './StatusDot';

export function TabBar() {
  const order = useAppStore((s) => s.order);
  const sessions = useAppStore((s) => s.sessions);
  const activeId = useAppStore((s) => s.activeId);
  const closing = useAppStore((s) => (s.closingId ? s.sessions[s.closingId] : undefined));
  const { setActive, closeSession, requestClose, cancelClose } = useAppStore.getState();

  if (order.length === 0) return null;

  return (
    <>
      <div className="flex shrink-0 items-end border-b border-line bg-panel">
        <div
          role="tablist"
          aria-label="Sesi terbuka"
          className="flex min-w-0 flex-1 items-end gap-px overflow-x-auto px-2 pt-1.5"
        >
          {order.map((id) => {
            const session = sessions[id];
            if (!session) return null;
            return (
              <Tab
                key={id}
                session={session}
                active={id === activeId}
                onSelect={() => setActive(id)}
                onClose={() => requestClose(session.id)}
              />
            );
          })}
        </div>
        <PreviewToggle />
      </div>
      <ConfirmDialog
        open={closing !== undefined}
        title="Tutup sesi?"
        message={`Proses "${closing?.title ?? ''}" akan dihentikan. Pekerjaan yang belum disimpan oleh CLI bisa hilang.`}
        confirmLabel="Hentikan & tutup"
        danger
        onCancel={cancelClose}
        onConfirm={() => {
          cancelClose();
          if (closing) void closeSession(closing.id);
        }}
      />
    </>
  );
}

function Tab({
  session,
  active,
  onSelect,
  onClose,
}: {
  session: SessionView;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const project = useAppStore((s) => s.projects.find((p) => p.id === session.projectId));
  const cli = useAppStore((s) => s.clis.find((c) => c.id === session.cliId));
  const color = cli?.color ?? 'var(--color-muted)';

  return (
    <div
      className={`group relative -mb-px flex max-w-60 min-w-36 shrink-0 items-center gap-2 rounded-t-md border border-b-0 pr-1 pl-3 text-sm transition-colors ${
        active
          ? 'border-line bg-term text-fg'
          : session.status === 'waiting'
            ? 'border-transparent bg-waiting/10 text-fg'
            : 'border-transparent text-muted hover:bg-hover hover:text-fg'
      }`}
    >
      {/* Top edge: the CLI's own color on the active tab, amber on a background tab waiting for input. */}
      {(active || session.status === 'waiting') && (
        <span
          className="absolute inset-x-0 top-0 h-0.5 rounded-t-md"
          style={{ background: active ? color : 'var(--color-waiting)' }}
          aria-hidden="true"
        />
      )}
      <button
        role="tab"
        aria-selected={active}
        onClick={onSelect}
        onAuxClick={(e) => e.button === 1 && onClose()}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
        title={`${session.title} (${session.cwd})`}
      >
        <StatusDot status={session.status} />
        <span className="min-w-0 truncate">
          {session.title}
          {project && <span className="text-muted"> · {project.name}</span>}
        </span>
        {session.connection === 'reconnecting' && (
          <span className="text-waiting" title="Menyambung ulang">
            <Icon name="refresh" size={12} className="motion-safe:animate-spin" />
            <span className="sr-only">Menyambung ulang</span>
          </span>
        )}
      </button>
      <button className="icon-btn" aria-label={`Tutup ${session.title}`} onClick={onClose}>
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

/**
 * Shows or hides the web preview. While it is hidden and a dev server is known, the button
 * names that server, so the user sees there is something to look at.
 */
function PreviewToggle() {
  const open = usePreviewStore((s) => s.open);
  const { toggle } = usePreviewStore.getState();
  const { resolved } = useActivePreview();
  const ready = !open && resolved !== null;

  return (
    <button
      className={`mr-2 mb-1 hidden shrink-0 items-center gap-1.5 self-center rounded-md border px-2 py-1 text-xs font-medium transition-colors md:inline-flex ${
        open
          ? 'border-transparent bg-accent/15 text-accent'
          : ready
            ? 'border-accent/40 text-fg hover:bg-accent/10'
            : 'border-transparent text-muted hover:bg-hover hover:text-fg'
      }`}
      aria-pressed={open}
      title={`Preview web (Ctrl+Alt+P)${resolved ? `: ${resolved.url}` : ''}`}
      onClick={toggle}
    >
      <Icon name="globe" size={14} className={ready ? 'text-accent' : undefined} />
      Preview
      {ready && resolved && (
        <span className="max-w-40 truncate font-mono text-[11px] text-accent">
          <span className="sr-only">dev server </span>
          {new URL(resolved.url).host}
        </span>
      )}
    </button>
  );
}
