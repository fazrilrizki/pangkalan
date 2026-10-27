import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CliInfo, Project } from '@integrasi/shared';
import { ApiError } from '../lib/api';
import type { SessionView } from '../stores/app-store';
import { useAppStore } from '../stores/app-store';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { NotifyToggle } from './NotifyToggle';
import { RemotePanel } from './RemotePanel';
import { StatusDot } from './StatusDot';
import { ThemeToggle } from './ThemeToggle';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projects = useAppStore((s) => s.projects);
  const [adding, setAdding] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const sorted = useMemo(() => sortProjects(projects), [projects]);

  return (
    <>
      <aside
        id="sidebar"
        className={`fixed inset-y-0 left-0 z-30 flex h-full w-72 max-w-[85vw] shrink-0 flex-col border-r border-line bg-panel transition-[translate,visibility] duration-200 md:static md:visible md:translate-x-0 ${
          open ? 'translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 py-3 pr-2 pl-4">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <Logo />
            Pangkalan
          </span>
          <div className="flex items-center">
            <button
              className="icon-btn"
              aria-label="Akses dari HP"
              title="Akses dari HP"
              aria-haspopup="dialog"
              onClick={() => setRemoteOpen(true)}
            >
              <Icon name="phone" />
            </button>
            <ThemeToggle />
            <NotifyToggle />
            <button className="icon-btn md:hidden" aria-label="Tutup sidebar" onClick={onClose}>
              <Icon name="x" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between py-1 pr-2 pl-4">
          <h2 className="text-xs font-medium text-muted">
            Project
            {projects.length > 0 && <span className="ml-1.5 font-mono">{projects.length}</span>}
          </h2>
          <button
            className="icon-btn"
            aria-label="Tambah project"
            title="Tambah project"
            aria-expanded={adding}
            onClick={() => setAdding((v) => !v)}
          >
            <Icon name={adding ? 'x' : 'plus'} size={15} />
          </button>
        </div>

        {adding && <AddProjectForm onDone={() => setAdding(false)} />}

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Daftar project">
          {sorted.length === 0 && !adding && (
            <div className="mx-2 mt-2 rounded-lg border border-dashed border-line-strong px-4 py-5 text-sm">
              <p className="text-fg">Belum ada project</p>
              <p className="mt-1 text-muted">
                Tambahkan folder kerja, lalu buka CLI langsung di dalamnya.
              </p>
              <button className="btn-primary mt-4" onClick={() => setAdding(true)}>
                <Icon name="plus" size={14} />
                Tambah project pertama
              </button>
            </div>
          )}
          <ul className="space-y-px">
            {sorted.map((project) => (
              <ProjectItem key={project.id} project={project} />
            ))}
          </ul>
        </nav>
      </aside>
      <RemotePanel open={remoteOpen} onClose={() => setRemoteOpen(false)} />
    </>
  );
}

function AddProjectForm({ onDone }: { onDone: () => void }) {
  const addProject = useAppStore((s) => s.addProject);
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addProject(path.trim(), name.trim() || undefined);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mx-3 mb-2 space-y-3 rounded-lg border border-line bg-panel-2 p-3"
    >
      <label className="block text-xs text-muted">
        Path folder
        <input
          className="field mt-1 font-mono"
          placeholder="C:\project\aplikasi-saya"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          autoFocus
          required
        />
      </label>
      <label className="block text-xs text-muted">
        Nama (opsional)
        <input
          className="field mt-1"
          placeholder="Nama folder"
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
        <button type="submit" className="btn-primary" disabled={busy || !path.trim()}>
          Tambah
        </button>
      </div>
    </form>
  );
}

function ProjectItem({ project }: { project: Project }) {
  const clis = useAppStore((s) => s.clis);
  const sessions = useAppStore((s) => s.sessions);
  const order = useAppStore((s) => s.order);
  const activeId = useAppStore((s) => s.activeId);
  const { updateProject, removeProject, openSession, setActive, setError, reloadClis } =
    useAppStore.getState();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const projectSessions = order
    .map((id) => sessions[id])
    .filter((s): s is SessionView => s?.projectId === project.id);
  const holdsActive = projectSessions.some((s) => s.id === activeId);

  const run = (action: Promise<unknown>) =>
    action.catch((err: unknown) => setError(errorMessage(err)));

  async function launch(cli: CliInfo | null) {
    setExpanded(false);
    await run(openSession(project.id, cli?.id ?? null));
  }

  return (
    <li>
      <div className="group flex items-center rounded-md pr-1 hover:bg-hover">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
          aria-expanded={expanded}
          onClick={() => {
            // Pick up edits to data/clis.json without a page reload.
            if (!expanded) void reloadClis().catch(() => {});
            setExpanded((v) => !v);
          }}
          title={project.path}
        >
          <Icon
            name="chevron"
            size={12}
            className={`shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          {renaming ? (
            <RenameField
              initial={project.name}
              onDone={(name) => {
                setRenaming(false);
                if (name && name !== project.name) void run(updateProject(project.id, { name }));
              }}
            />
          ) : (
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${holdsActive ? 'font-semibold' : ''}`}>
                {project.name}
              </span>
              <span className="block truncate-start font-mono text-[11px] text-muted">
                <bdi>{project.path}</bdi>
              </span>
            </span>
          )}
        </button>
        <button
          className={`icon-btn ${project.favorite ? 'text-fg' : 'reveal-on-hover'}`}
          aria-label={project.favorite ? 'Hapus dari favorit' : 'Jadikan favorit'}
          aria-pressed={project.favorite}
          onClick={() => void run(updateProject(project.id, { favorite: !project.favorite }))}
        >
          <Icon name="star" size={14} filled={project.favorite} />
        </button>
        <button
          className="icon-btn reveal-on-hover"
          aria-label={`Ganti nama ${project.name}`}
          onClick={() => setRenaming(true)}
        >
          <Icon name="pencil" size={14} />
        </button>
        <button
          className="icon-btn reveal-on-hover hover:!text-error"
          aria-label={`Hapus ${project.name}`}
          onClick={() => setConfirmDelete(true)}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      {expanded && (
        <div className="mb-2 ml-7 flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Pilih CLI">
          {clis.map((cli) => (
            <button
              key={cli.id}
              disabled={!cli.enabled}
              title={cli.enabled ? `Buka ${cli.name}` : `${cli.name} dinonaktifkan di clis.json`}
              onClick={() => void launch(cli)}
              className="chip"
            >
              <span className="size-2 rounded-full" style={{ background: cli.color }} />
              {cli.name}
            </button>
          ))}
          <button onClick={() => void launch(null)} className="chip">
            <Icon name="terminal" size={12} />
            Terminal
          </button>
        </div>
      )}

      {projectSessions.length > 0 && (
        <ul className="mb-1.5 ml-[15px] space-y-px border-l border-line pl-2.5">
          {projectSessions.map((session) => (
            <li key={session.id} className="relative">
              {session.id === activeId && (
                // Marks the session shown in the terminal, on the project's session thread.
                <span
                  className="absolute top-1 bottom-1 -left-[11px] w-0.5 rounded-full bg-accent"
                  aria-hidden="true"
                />
              )}
              <button
                onClick={() => setActive(session.id)}
                aria-current={session.id === activeId}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs [@media(pointer:coarse)]:min-h-11 ${
                  session.id === activeId
                    ? 'bg-selected text-fg'
                    : 'text-muted hover:bg-hover hover:text-fg'
                }`}
              >
                <StatusDot status={session.status} />
                <span className="truncate">{session.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Hapus project "${project.name}"?`}
        message="Project hanya dihapus dari daftar. Folder dan isinya di disk tidak disentuh."
        confirmLabel="Hapus"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void run(removeProject(project.id));
        }}
      />
    </li>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="field py-1"
      value={value}
      autoFocus
      aria-label="Nama project"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onDone(value.trim());
        if (e.key === 'Escape') onDone(initial);
      }}
    />
  );
}
