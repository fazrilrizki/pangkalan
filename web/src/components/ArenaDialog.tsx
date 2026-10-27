import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Project, ProjectGitInfo } from '@integrasi/shared';
import { ApiError, apiFetch } from '../lib/api';
import { useAppStore } from '../stores/app-store';
import { useArenaStore } from '../stores/arena-store';
import type { EntryDraft } from './ArenaEntriesField';
import { ArenaEntriesField } from './ArenaEntriesField';
import { Icon } from './Icon';

/** Form to start an arena: one prompt, two to four contestants, each in its own worktree. */
export function ArenaDialog({
  project,
  open,
  onClose,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const allClis = useAppStore((s) => s.clis);
  const clis = useMemo(() => allClis.filter((c) => c.enabled), [allClis]);
  const create = useArenaStore((s) => s.create);
  const [git, setGit] = useState<ProjectGitInfo | null>(null);
  const [prompt, setPrompt] = useState('');
  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setGit(null);
    // Default: two different CLIs when there are two, otherwise the same CLI twice.
    const ids = clis.map((c) => c.id);
    setEntries((current) =>
      current.length > 0
        ? current
        : [0, 1].map((i) => ({ key: i, cliId: ids[i] ?? ids[0] ?? '', args: '' })),
    );
    apiFetch<ProjectGitInfo>(`/api/projects/${project.id}/git`).then(setGit, () =>
      setGit({ isRepo: false, branch: null, dirty: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open, project.id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({
        projectId: project.id,
        prompt: prompt.trim(),
        entries: entries.map((d) => ({
          cliId: d.cliId,
          extraArgs: d.args.trim() ? d.args.trim().split(/\s+/) : [],
        })),
      });
      setPrompt('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const blocked = git !== null && (!git.isRepo || git.branch === null);

  return (
    <dialog
      ref={ref}
      aria-labelledby="arena-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-line-strong bg-panel p-0 text-fg shadow-overlay backdrop:bg-black/50"
    >
      <form onSubmit={(e) => void submit(e)}>
        <header className="flex items-center justify-between gap-2 border-b border-line py-3 pr-2 pl-5">
          <h2 id="arena-title" className="text-base font-semibold">
            Adu agen · {project.name}
          </h2>
          <button type="button" className="icon-btn" aria-label="Tutup" onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <p className="text-sm leading-relaxed text-muted">
            Prompt yang sama dikerjakan beberapa agen, masing-masing di worktree dan branch sendiri.
            Setelah selesai, bandingkan hasilnya dan merge pemenangnya.
          </p>

          <GitNote git={git} />

          <label className="block text-xs font-medium text-muted">
            Prompt
            <textarea
              className="field mt-1.5 min-h-28 resize-y leading-relaxed"
              placeholder="Tulis tugas untuk semua peserta"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
            />
          </label>

          <ArenaEntriesField entries={entries} clis={clis} onChange={setEntries} />

          {error && (
            <p
              role="alert"
              className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line bg-panel-2 px-5 py-3">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || blocked || git === null || !prompt.trim() || clis.length === 0}
          >
            {busy ? 'Menyiapkan worktree…' : `Mulai adu (${entries.length} peserta)`}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function GitNote({ git }: { git: ProjectGitInfo | null }) {
  if (!git) return <p className="text-xs text-muted">Memeriksa repo git…</p>;
  if (!git.isRepo) {
    return (
      <p role="alert" className="text-sm text-error">
        Folder project ini bukan repo git. Adu butuh git untuk membuat worktree tiap peserta.
      </p>
    );
  }
  if (git.branch === null) {
    return (
      <p role="alert" className="text-sm text-error">
        Repo sedang detached HEAD. Checkout sebuah branch dulu.
      </p>
    );
  }
  return (
    <div className="text-xs leading-relaxed text-muted">
      <p>
        Mulai dari commit terakhir di branch <code className="font-mono text-fg">{git.branch}</code>
        . Pemenang di-merge ke branch itu.
      </p>
      {git.dirty && (
        <p className="mt-1 text-waiting">
          Ada perubahan yang belum di-commit. Peserta tidak ikut melihatnya, dan merge pemenang
          menunggu sampai perubahan itu di-commit atau di-stash.
        </p>
      )}
    </div>
  );
}
