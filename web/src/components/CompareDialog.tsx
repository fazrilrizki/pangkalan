import { useCallback, useEffect, useRef, useState } from 'react';
import type { Arena, ArenaEntryDiff } from '@integrasi/shared';
import { contestantVariant } from '@integrasi/shared';
import { ApiError } from '../lib/api';
import { useAppStore } from '../stores/app-store';
import { useArenaStore } from '../stores/arena-store';
import { ConfirmDialog } from './ConfirmDialog';
import { DiffView } from './DiffView';
import { Icon } from './Icon';
import { STATUS_LABEL, StatusDot } from './StatusDot';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

/** Each contestant's diff against the starting commit, and the place to pick the winner. */
export function CompareDialog({ arena }: { arena: Arena | undefined }) {
  const ref = useRef<HTMLDialogElement>(null);
  const clis = useAppStore((s) => s.clis);
  const sessions = useAppStore((s) => s.sessions);
  const { diff, pickWinner, setComparing } = useArenaStore.getState();
  const [diffs, setDiffs] = useState<ArenaEntryDiff[] | null>(null);
  const [selected, setSelected] = useState('A');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const open = arena !== undefined;

  const load = useCallback(async () => {
    if (!arena) return;
    setError(null);
    setBusy(true);
    try {
      setDiffs(await diff(arena.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [arena, diff]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
    if (open) {
      setDiffs(null);
      setSelected('A');
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when opened
  }, [open]);

  const cliName = (cliId: string) => clis.find((c) => c.id === cliId)?.name ?? cliId;
  const statusOf = (sessionId: string | null) =>
    sessionId ? sessions[sessionId]?.status : undefined;
  const current = diffs?.find((d) => d.letter === selected);
  const entry = arena?.entries.find((e) => e.letter === selected);
  // A diff taken while a contestant is still going can change under the user's choice.
  const busyLetters =
    arena?.entries
      .filter((e) => ['working', 'waiting'].includes(statusOf(e.sessionId) ?? ''))
      .map((e) => e.letter) ?? [];

  async function choose() {
    if (!arena) return;
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await pickWinner(arena.id, selected);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="compare-title"
      onCancel={(e) => {
        e.preventDefault();
        setComparing(null);
      }}
      className="m-auto h-[min(820px,calc(100dvh-32px))] w-[min(1100px,calc(100vw-32px))] rounded-lg border border-line-strong bg-panel p-0 text-fg shadow-overlay backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start gap-2 border-b border-line py-3 pr-2 pl-5">
          <div className="min-w-0 flex-1">
            <h2 id="compare-title" className="text-base font-semibold">
              Bandingkan hasil
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted" title={arena?.prompt}>
              {arena?.prompt.split('\n', 1)[0]}
            </p>
          </div>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            disabled={busy}
            onClick={() => void load()}
          >
            <Icon name="refresh" size={13} />
            Muat ulang
          </button>
          <button className="icon-btn" aria-label="Tutup" onClick={() => setComparing(null)}>
            <Icon name="x" />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="Peserta"
          className="flex overflow-x-auto overflow-y-hidden border-b border-line bg-panel-2 px-2"
        >
          {arena?.entries.map((e) => {
            const d = diffs?.find((x) => x.letter === e.letter);
            const status = statusOf(e.sessionId);
            const variant = contestantVariant(e.extraArgs);
            return (
              <button
                key={e.letter}
                role="tab"
                aria-selected={selected === e.letter}
                onClick={() => setSelected(e.letter)}
                className={`-mb-px flex shrink-0 flex-col items-start gap-0.5 border-b-2 px-3 py-2 text-left ${
                  selected === e.letter
                    ? 'border-accent text-fg'
                    : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                <span className="flex items-baseline gap-2 text-sm">
                  <span className="font-mono font-semibold">{e.letter}</span>
                  {cliName(e.cliId)}
                  {variant && <span className="font-mono text-xs text-muted">{variant}</span>}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {status ? (
                    <span className="flex items-center gap-1.5">
                      <StatusDot status={status} size={6} />
                      {STATUS_LABEL[status]}
                    </span>
                  ) : (
                    <span>Berhenti</span>
                  )}
                  {d && (
                    <span className="font-mono">
                      {d.files.length} file{' '}
                      <span className="text-idle">+{d.files.reduce((n, f) => n + f.added, 0)}</span>{' '}
                      <span className="text-error">
                        −{d.files.reduce((n, f) => n + f.removed, 0)}
                      </span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {busyLetters.length > 0 && diffs && (
          <p className="border-b border-line bg-waiting/10 px-5 py-2 text-sm text-waiting">
            Peserta {busyLetters.join(' dan ')} belum selesai, jadi diff-nya masih bisa berubah.
            Muat ulang setelah semuanya siap.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="border-b border-error/30 bg-error/10 px-5 py-2 text-sm text-error"
          >
            {error}
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col md:flex-row" role="tabpanel">
          {!diffs && !error && (
            <p className="p-5 text-sm text-muted">Menghitung diff tiap peserta…</p>
          )}
          {current && current.files.length === 0 && (
            <p className="p-5 text-sm text-muted">
              Peserta {current.letter} belum mengubah apa pun dibanding commit awal. Bila ia masih
              bekerja, tunggu lalu muat ulang.
            </p>
          )}
          {current && current.files.length > 0 && <DiffView key={current.letter} diff={current} />}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line bg-panel-2 px-5 py-3">
          <p className="mr-auto min-w-0 basis-64 text-xs text-muted">
            Pemenang di-merge ke <code className="font-mono text-fg">{arena?.baseBranch}</code>.
            Semua sesi peserta dihentikan; branch tiap peserta tetap ada.
          </p>
          <button
            className="btn-primary"
            disabled={busy || !entry || !diffs}
            onClick={() => setConfirming(true)}
          >
            Pilih {selected} sebagai pemenang
          </button>
        </footer>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Merge peserta ${selected}?`}
        message={`Perubahan ${selected} (${entry ? cliName(entry.cliId) : ''}${
          entry && contestantVariant(entry.extraArgs)
            ? `, ${contestantVariant(entry.extraArgs)}`
            : ''
        }) di-merge ke ${arena?.baseBranch ?? ''}. Semua sesi adu ini dihentikan dan worktree-nya dihapus.`}
        confirmLabel="Merge pemenang"
        onCancel={() => setConfirming(false)}
        onConfirm={() => void choose()}
      />
    </dialog>
  );
}
