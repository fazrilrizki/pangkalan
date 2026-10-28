import { useEffect, useState } from 'react';
import type { Arena, SessionStatus } from '@integrasi/shared';
import { contestantVariant } from '@integrasi/shared';
import { ApiError } from '../lib/api';
import { useAppStore } from '../stores/app-store';
import { useArenaStore } from '../stores/arena-store';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { STATUS_LABEL, StatusDot } from './StatusDot';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

/** Order the progress summary reads in: what needs you first, then what is still running. */
const SUMMARY_ORDER: SessionStatus[] = ['waiting', 'working', 'idle', 'exited', 'error'];

/**
 * Strip above the terminal while the active tab belongs to a running arena. It answers "is it
 * done, can I compare yet?": the prompt, a count of contestants per state, and the actions.
 * Side by side, each pane already names its contestant, so the switcher only shows one at a time.
 */
export function ArenaBar({ arena }: { arena: Arena }) {
  const sessions = useAppStore((s) => s.sessions);
  const activeId = useAppStore((s) => s.activeId);
  const { setActive, setError } = useAppStore.getState();
  const layout = useArenaStore((s) => s.layout[arena.id] ?? 'grid');
  const { setLayout, setComparing, discard, reopen, load } = useArenaStore.getState();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const run = (action: Promise<unknown>) =>
    action.catch((err: unknown) => setError(errorMessage(err)));

  // The server types the prompt in on its own; poll briefly so "belum terkirim" clears.
  const pending = arena.entries.some((e) => e.prompt === 'pending' && e.sessionId);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [pending, load]);

  const live = arena.entries.flatMap((entry) => {
    const session = entry.sessionId ? sessions[entry.sessionId] : undefined;
    return session ? [{ entry, session }] : [];
  });
  const stopped = arena.entries.filter((e) => !e.sessionId || !sessions[e.sessionId]);
  const counts = SUMMARY_ORDER.map((status) => ({
    status,
    count: live.filter((c) => c.session.status === status).length,
  })).filter((c) => c.count > 0);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line bg-panel px-3 py-1.5 text-xs">
      <p className="min-w-0 flex-1 basis-48 truncate text-muted" title={arena.prompt}>
        <span className="font-medium text-fg">Adu</span> {arena.prompt.split('\n', 1)[0]}
      </p>

      {/* Text only: the per-contestant dots already carry the motion, the summary stays still. */}
      <p className="flex shrink-0 items-center gap-1.5 text-muted" aria-live="polite">
        {counts.map(({ status, count }, i) => (
          <span key={status} className={status === 'waiting' ? 'font-medium text-waiting' : ''}>
            {i > 0 && <span className="mr-1.5 text-line-strong">·</span>}
            {count} {STATUS_LABEL[status].toLowerCase()}
          </span>
        ))}
      </p>

      {layout === 'single' && live.length > 0 && (
        <div role="group" aria-label="Pilih peserta" className="flex shrink-0 gap-1">
          {live.map(({ entry, session }) => {
            const variant = contestantVariant(entry.extraArgs);
            return (
              <button
                key={entry.letter}
                onClick={() => setActive(session.id)}
                aria-pressed={session.id === activeId}
                title={`${session.title}: ${STATUS_LABEL[session.status]}`}
                className={`chip ${session.id === activeId ? '!border-accent text-fg' : 'text-muted'}`}
              >
                <StatusDot status={session.status} size={6} />
                <span className="font-mono font-semibold">{entry.letter}</span>
                {variant && <span className="font-mono">{variant}</span>}
              </button>
            );
          })}
        </div>
      )}

      {stopped.map((entry) => (
        <button
          key={entry.letter}
          className="btn-ghost shrink-0 px-2 py-0.5 text-xs"
          title="Sesi peserta ini sudah berhenti. Worktree dan hasil kerjanya masih ada."
          onClick={() => void run(reopen(arena.id, entry.letter))}
        >
          Buka lagi {entry.letter}
        </button>
      ))}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <div
          role="group"
          aria-label="Tata letak peserta"
          className="flex rounded-md border border-line-strong p-0.5"
        >
          {(['grid', 'single'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={layout === value}
              onClick={() => setLayout(arena.id, value)}
              className={`rounded px-2 py-0.5 [@media(pointer:coarse)]:py-2 ${
                layout === value ? 'bg-selected text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {value === 'grid' ? 'Berdampingan' : 'Satu-satu'}
            </button>
          ))}
        </div>
        <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => setComparing(arena.id)}>
          <Icon name="columns" size={13} />
          Bandingkan
        </button>
        <button
          className="btn-ghost px-2 py-1 text-xs hover:!text-error"
          onClick={() => setConfirmDiscard(true)}
        >
          Batalkan
        </button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Batalkan adu?"
        message="Semua peserta dihentikan dan worktree-nya dihapus. Hasil kerja tiap peserta tetap tersimpan di branch adu/… masing-masing. Branch asal tidak diubah."
        confirmLabel="Batalkan adu"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          void run(discard(arena.id));
        }}
      />
    </div>
  );
}
