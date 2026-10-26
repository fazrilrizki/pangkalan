import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CliInfo, Project } from '@integrasi/shared';
import { ApiError } from '../lib/api';
import type { SessionView } from '../stores/app-store';
import { useAppStore } from '../stores/app-store';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { NotifyToggle } from './NotifyToggle';
import { StatusDot } from './StatusDot';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name),
  );
}

export function Sidebar() {
  const projects = useAppStore((s) => s.projects);
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(() => sortProjects(projects), [projects]);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-accent text-bg">
            <Icon name="terminal" size={15} />
          </span>
          <span className="font-semibold tracking-tight">Integrasi AI</span>
        </div>
        <div className="flex items-center gap-0.5">
          <NotifyToggle />
          <button
            className="icon-btn"
            aria-label="Tambah project"
            title="Tambah project"
            onClick={() => setAdding((v) => !v)}
          >
            <Icon name={adding ? 'x' : 'plus'} />
          </button>
        </div>
      </div>

      {adding && <AddProjectForm onDone={() => setAdding(false)} />}

      <p className="px-4 pt-3 pb-1 text-[11px] font-medium tracking-wider text-muted uppercase">
        Projects
      </p>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Daftar project">
        {sorted.length === 0 && !adding && (
          <button
            className="mx-2 mt-2 w-[calc(100%-1rem)] rounded-lg border border-dashed border-line px-3 py-6 text-sm text-muted hover:border-accent/50 hover:text-fg"
            onClick={() => setAdding(true)}
          >
            Tambah project pertama
          </button>
        )}
        <ul className="space-y-0.5">
          {sorted.map((project) => (
            <ProjectItem key={project.id} project={project} />
          ))}
        </ul>
      </nav>
    </aside>
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
    <form onSubmit={(e) => void submit(e)} className="mx-3 space-y-2 rounded-xl bg-panel-2 p-3">
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
  const { updateProject, removeProject, openSession, setActive, setError } = useAppStore.getState();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const projectSessions = order
    .map((id) => sessions[id])
    .filter((s): s is SessionView => s?.projectId === project.id);

  const run = (action: Promise<unknown>) =>
    action.catch((err: unknown) => setError(errorMessage(err)));

  async function launch(cli: CliInfo | null) {
    setExpanded(false);
    await run(openSession(project.id, cli?.id ?? null));
  }

  return (
    <li>
      <div className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-white/[0.04]">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
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
              <span className="block truncate text-sm">{project.name}</span>
              <span className="block truncate font-mono text-[11px] text-muted">
                {project.path}
              </span>
            </span>
          )}
        </button>
        <button
          className={`icon-btn ${project.favorite ? 'text-waiting' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
          aria-label={project.favorite ? 'Hapus dari favorit' : 'Jadikan favorit'}
          aria-pressed={project.favorite}
          onClick={() => void run(updateProject(project.id, { favorite: !project.favorite }))}
        >
          <Icon name="star" size={14} filled={project.favorite} />
        </button>
        <button
          className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={`Ganti nama ${project.name}`}
          onClick={() => setRenaming(true)}
        >
          <Icon name="pencil" size={14} />
        </button>
        <button
          className="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100 hover:!text-error"
          aria-label={`Hapus ${project.name}`}
          onClick={() => setConfirmDelete(true)}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      {expanded && (
        <div className="mb-2 ml-6 flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Pilih CLI">
          {clis.map((cli) => (
            <button
              key={cli.id}
              disabled={!cli.enabled}
              title={cli.enabled ? `Buka ${cli.name}` : `${cli.name} dinonaktifkan di clis.json`}
              onClick={() => void launch(cli)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 py-1 text-xs hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="size-2 rounded-full" style={{ background: cli.color }} />
              {cli.name}
            </button>
          ))}
          <button
            onClick={() => void launch(null)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 py-1 text-xs hover:border-white/20"
          >
            <Icon name="terminal" size={12} />
            Terminal
          </button>
        </div>
      )}

      {projectSessions.length > 0 && (
        <ul className="mb-1 ml-6 space-y-0.5 border-l border-line pl-2">
          {projectSessions.map((session) => (
            <li key={session.id}>
              <button
                onClick={() => setActive(session.id)}
                aria-current={session.id === activeId}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
                  session.id === activeId ? 'bg-white/[0.07] text-fg' : 'text-muted hover:text-fg'
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
