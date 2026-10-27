import type { SessionView } from '../stores/app-store';
import { useAppStore } from '../stores/app-store';
import { STATUS_LABEL } from './StatusDot';

const CONNECTION_LABEL = {
  connecting: 'menghubungkan',
  reconnecting: 'menyambung ulang',
  gone: 'koneksi terputus',
} as const;

/** Bottom line under the terminal: the active session's state in words, its CLI, and its folder. */
export function StatusBar({ session }: { session: SessionView }) {
  const cli = useAppStore((s) => s.clis.find((c) => c.id === session.cliId));

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 font-mono text-[11px] text-muted">
      <span className="flex shrink-0 items-center gap-1.5 text-fg">
        <span
          className="size-1.5 rounded-full"
          style={{ background: `var(--color-${session.status})` }}
          aria-hidden="true"
        />
        {STATUS_LABEL[session.status]}
      </span>
      <span className="shrink-0">{cli?.name ?? 'Terminal'}</span>
      <span className="min-w-0 truncate-start" title={session.cwd}>
        <bdi>{session.cwd}</bdi>
      </span>
      {session.connection !== 'open' && (
        <span className="ml-auto shrink-0 text-waiting">
          {CONNECTION_LABEL[session.connection]}
        </span>
      )}
    </footer>
  );
}
