import { useEffect, useRef, useState } from 'react';
import type { DirListing } from '@integrasi/shared';
import { ApiError, apiFetch } from '../lib/api';
import { useAppStore } from '../stores/app-store';
import { Icon } from './Icon';

const LAST_DIR_KEY = 'integrasi.lastFolder';

function readLastDir(): string | undefined {
  try {
    return localStorage.getItem(LAST_DIR_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveLastDir(dir: string) {
  try {
    localStorage.setItem(LAST_DIR_KEY, dir);
  } catch {
    // Not remembering the folder only costs a few extra clicks next time.
  }
}

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

/**
 * Folder explorer served by the server: the browser cannot hand over a real folder path,
 * and the app is also used from a phone where the folders live on the other machine.
 */
export function AddProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="add-project-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-lg border border-line-strong bg-panel p-0 text-fg shadow-overlay backdrop:bg-black/50"
    >
      {open && <FolderPicker onDone={onClose} />}
    </dialog>
  );
}

function FolderPicker({ onDone }: { onDone: () => void }) {
  const addProject = useAppStore((s) => s.addProject);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  async function browse(dir?: string) {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const query = dir === undefined ? '' : `?path=${encodeURIComponent(dir)}`;
      const next = await apiFetch<DirListing>(`/api/fs/dirs${query}`);
      if (id === request.current) setListing(next);
    } catch (err) {
      if (id !== request.current) return;
      // A remembered folder may have been deleted since; fall back to the home folder.
      if (dir !== undefined && listing === null) return void browse();
      setError(errorMessage(err));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  useEffect(() => {
    void browse(readLastDir());
    // Load once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose() {
    if (!listing) return;
    setBusy(true);
    setError(null);
    try {
      await addProject(listing.path, name.trim() || undefined);
      saveLastDir(listing.parent ?? listing.path);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const folderName = listing ? listing.path.split(/[\\/]/).filter(Boolean).pop() : undefined;

  return (
    <>
      <div className="flex items-center justify-between gap-2 py-3 pr-2 pl-5">
        <h2 id="add-project-title" className="text-base font-semibold">
          Pilih folder project
        </h2>
        <button className="icon-btn" aria-label="Tutup" onClick={onDone}>
          <Icon name="x" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-y border-line bg-panel-2 px-2 py-1.5">
        <button
          className="icon-btn"
          aria-label="Folder induk"
          title="Folder induk"
          disabled={!listing?.parent || loading}
          onClick={() => listing?.parent && void browse(listing.parent)}
        >
          <Icon name="chevron" size={14} className="rotate-180" />
        </button>
        <p
          className="min-w-0 flex-1 truncate-start font-mono text-xs text-muted"
          aria-label="Folder saat ini"
          title={listing?.path}
        >
          <bdi>{listing?.path ?? '…'}</bdi>
        </p>
      </div>

      {listing && listing.roots.length > 1 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3" role="group" aria-label="Drive">
          {listing.roots.map((root) => (
            <button
              key={root.path}
              className="chip font-mono"
              aria-pressed={listing.path.toLowerCase().startsWith(root.path.toLowerCase())}
              onClick={() => void browse(root.path)}
            >
              {root.name}
            </button>
          ))}
        </div>
      )}

      <div className="h-[min(320px,45dvh)] overflow-y-auto px-2 py-2" aria-busy={loading}>
        {listing && listing.dirs.length === 0 && !loading && (
          <p className="px-3 py-4 text-sm text-muted">Tidak ada subfolder di sini.</p>
        )}
        <ul className="space-y-px" aria-label="Subfolder">
          {listing?.dirs.map((dir) => (
            <li key={dir.path}>
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-hover disabled:opacity-60 [@media(pointer:coarse)]:min-h-11"
                disabled={loading}
                onClick={() => void browse(dir.path)}
              >
                <Icon name="folder" size={15} className="shrink-0 text-muted" />
                <span className="truncate">{dir.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 border-t border-line bg-panel-2 px-5 py-3">
        <label className="block text-xs text-muted">
          Nama (opsional)
          <input
            className="field mt-1"
            placeholder={folderName ?? 'Nama folder'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onDone}>
            Batal
          </button>
          <button
            className="btn-primary"
            disabled={!listing || loading || busy}
            onClick={() => void choose()}
          >
            Pilih folder ini
          </button>
        </div>
      </div>
    </>
  );
}
