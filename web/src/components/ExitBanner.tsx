import type { SessionView } from '../stores/app-store';
import { useAppStore } from '../stores/app-store';
import { Icon } from './Icon';

/** Shown over a terminal whose process has ended. */
export function ExitBanner({ session }: { session: SessionView }) {
  const { openSession, closeSession, setError } = useAppStore.getState();
  const failed = session.status === 'error';

  async function restart() {
    try {
      if (session.projectId) await openSession(session.projectId, session.cliId);
      await closeSession(session.id);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div
      role="status"
      className="absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line-strong bg-panel px-4 py-3 shadow-overlay"
    >
      <span className={`size-2.5 rounded-full ${failed ? 'bg-error' : 'bg-exited'}`} />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{session.title}</span>{' '}
        <span className="text-muted">
          {failed ? `berhenti dengan kode ${session.exitCode}` : 'sudah selesai'}
        </span>
      </p>
      {session.projectId && (
        <button className="btn-primary" onClick={() => void restart()}>
          <Icon name="refresh" size={14} />
          Jalankan ulang
        </button>
      )}
      <button className="btn-ghost" onClick={() => void closeSession(session.id)}>
        Tutup
      </button>
    </div>
  );
}
