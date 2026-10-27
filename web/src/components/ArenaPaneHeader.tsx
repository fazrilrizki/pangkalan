import type { Arena, ArenaEntry } from '@integrasi/shared';
import { contestantVariant } from '@integrasi/shared';
import { ApiError } from '../lib/api';
import { useAppStore } from '../stores/app-store';
import { useArenaStore } from '../stores/arena-store';
import { STATUS_LABEL, StatusDot } from './StatusDot';

/**
 * Label row above one contestant in the side-by-side layout. Says who it is (letter, CLI and the
 * variant that sets it apart) and what it is doing in words, so the panes can be told apart
 * without relying on color. A pane waiting for input is tinted the same way a waiting tab is.
 */
export function ArenaPaneHeader({
  arena,
  entry,
  sessionId,
  focused,
}: {
  arena: Arena;
  entry: ArenaEntry;
  sessionId: string;
  focused: boolean;
}) {
  const session = useAppStore((s) => s.sessions[sessionId]);
  const cliName = useAppStore((s) => s.clis.find((c) => c.id === entry.cliId)?.name);
  const { setActive, setError } = useAppStore.getState();
  const sendPrompt = useArenaStore((s) => s.sendPrompt);
  if (!session) return null;

  const variant = contestantVariant(entry.extraArgs);
  const waiting = session.status === 'waiting';
  const promptPending = entry.prompt === 'pending' && session.exitCode === null;

  return (
    <div
      className={`flex shrink-0 items-center gap-2 border-b-2 pr-1 text-xs ${
        focused ? 'border-accent' : 'border-line'
      } ${waiting ? 'bg-waiting/10' : 'bg-panel'}`}
    >
      <button
        onClick={() => setActive(sessionId)}
        aria-current={focused}
        aria-label={`Fokus ke peserta ${entry.letter}`}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 text-left"
      >
        <span className="font-mono font-semibold text-fg">{entry.letter}</span>
        <span className={focused ? 'text-fg' : 'text-muted'}>{cliName ?? entry.cliId}</span>
        {variant && <span className="min-w-0 truncate font-mono text-muted">{variant}</span>}
      </button>

      {promptPending ? (
        <span className="flex shrink-0 items-center gap-1.5 text-waiting">
          Prompt belum terkirim
          <button
            className="btn-ghost px-2 py-0.5 text-xs text-fg"
            title="CLI belum terlihat siap. Kirim prompt sekarang bila memang sudah siap menerima input."
            onClick={() =>
              void sendPrompt(arena.id, entry.letter).catch((err: unknown) =>
                setError(err instanceof ApiError ? err.message : String(err)),
              )
            }
          >
            Kirim
          </button>
        </span>
      ) : (
        <span
          className={`flex shrink-0 items-center gap-1.5 pr-2 ${waiting ? 'text-waiting' : 'text-muted'}`}
        >
          <StatusDot status={session.status} />
          {STATUS_LABEL[session.status]}
        </span>
      )}
    </div>
  );
}
