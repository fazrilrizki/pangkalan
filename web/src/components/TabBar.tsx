import type { SessionView } from '../stores/app-store';
import { useAppStore } from '../stores/app-store';
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
      <div
        role="tablist"
        aria-label="Sesi terbuka"
        className="flex shrink-0 items-end gap-px overflow-x-auto border-b border-line bg-panel px-2 pt-1.5"
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
