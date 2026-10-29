import { create } from 'zustand';
import type {
  CliInfo,
  Project,
  ServerMessage,
  SessionInfo,
  UpdateProjectInput,
} from '@integrasi/shared';
import { apiFetch } from '../lib/api';
import type { ConnectionState } from '../lib/ws-client';

export interface SessionView extends SessionInfo {
  connection: ConnectionState;
}

const ACTIVE_KEY = 'integrasi.activeSession';

function rememberActive(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // per-viewer convenience only
  }
}

function recallActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

interface AppState {
  loaded: boolean;
  error: string | null;
  /** Outcome of an action that ends without a visible result, e.g. merging an arena winner. */
  notice: string | null;
  projects: Project[];
  clis: CliInfo[];
  sessions: Record<string, SessionView>;
  /** Tab order. */
  order: string[];
  activeId: string | null;
  /** Session awaiting the user's confirmation before it is killed. */
  closingId: string | null;

  load(): Promise<void>;
  reloadClis(): Promise<void>;
  addProject(path: string, name?: string): Promise<Project>;
  updateProject(id: string, changes: UpdateProjectInput): Promise<void>;
  removeProject(id: string): Promise<void>;
  openSession(projectId: string, cliId: string | null): Promise<void>;
  /** Adds sessions the server already started (e.g. an arena's contestants); focuses the first. */
  addSessions(infos: SessionInfo[]): void;
  /** Drops tabs whose sessions the server already ended, without another DELETE. */
  dropSessions(ids: string[]): void;
  closeSession(id: string): Promise<void>;
  /** Closes a finished session right away; asks for confirmation if it is still running. */
  requestClose(id: string): void;
  cancelClose(): void;
  /** Opens another session with the same project and CLI as the active one. */
  duplicateActive(): Promise<void>;
  setActive(id: string): void;
  cycleActive(step: 1 | -1): void;
  applyServerMessage(id: string, message: ServerMessage): void;
  setConnection(id: string, connection: ConnectionState): void;
  setError(error: string | null): void;
  setNotice(notice: string | null): void;
}

const toView = (info: SessionInfo): SessionView => ({ ...info, connection: 'connecting' });

export const useAppStore = create<AppState>()((set, get) => ({
  loaded: false,
  error: null,
  notice: null,
  projects: [],
  clis: [],
  sessions: {},
  order: [],
  activeId: null,
  closingId: null,

  async load() {
    const [projects, { clis }, sessions] = await Promise.all([
      apiFetch<Project[]>('/api/projects'),
      apiFetch<{ clis: CliInfo[] }>('/api/clis'),
      apiFetch<SessionInfo[]>('/api/sessions'),
    ]);
    const ordered = [...sessions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const remembered = recallActive();
    const activeId = ordered.some((s) => s.id === remembered)
      ? remembered
      : (ordered[0]?.id ?? null);
    set({
      loaded: true,
      projects,
      clis,
      sessions: Object.fromEntries(ordered.map((s) => [s.id, toView(s)])),
      order: ordered.map((s) => s.id),
      activeId,
    });
  },

  async reloadClis() {
    const { clis } = await apiFetch<{ clis: CliInfo[] }>('/api/clis');
    set({ clis });
  },

  async addProject(path, name) {
    const project = await apiFetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ path, ...(name ? { name } : {}) }),
    });
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  async updateProject(id, changes) {
    const project = await apiFetch<Project>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? project : p)) }));
  },

  async removeProject(id) {
    await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },

  async openSession(projectId, cliId) {
    const info = await apiFetch<SessionInfo>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ projectId, ...(cliId ? { cliId } : {}) }),
    });
    set((s) => ({
      sessions: { ...s.sessions, [info.id]: toView(info) },
      order: [...s.order, info.id],
      activeId: info.id,
    }));
    rememberActive(info.id);
  },

  addSessions(infos) {
    if (infos.length === 0) return;
    set((s) => ({
      sessions: { ...s.sessions, ...Object.fromEntries(infos.map((i) => [i.id, toView(i)])) },
      order: [...s.order, ...infos.map((i) => i.id)],
      activeId: infos[0]!.id,
    }));
    rememberActive(infos[0]!.id);
  },

  dropSessions(ids) {
    set((s) => {
      const order = s.order.filter((x) => !ids.includes(x));
      const sessions = Object.fromEntries(
        Object.entries(s.sessions).filter(([id]) => !ids.includes(id)),
      );
      const activeId = s.activeId && ids.includes(s.activeId) ? (order.at(-1) ?? null) : s.activeId;
      rememberActive(activeId);
      return { order, sessions, activeId };
    });
  },

  async closeSession(id) {
    await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {
      // already gone on the server: still drop the tab
    });
    set((s) => {
      const index = s.order.indexOf(id);
      const order = s.order.filter((x) => x !== id);
      const { [id]: _, ...sessions } = s.sessions;
      const activeId =
        s.activeId === id ? (order[Math.min(index, order.length - 1)] ?? null) : s.activeId;
      rememberActive(activeId);
      return { order, sessions, activeId };
    });
  },

  requestClose(id) {
    const session = get().sessions[id];
    if (!session) return;
    if (session.exitCode !== null) void get().closeSession(id);
    else set({ closingId: id });
  },

  cancelClose() {
    set({ closingId: null });
  },

  async duplicateActive() {
    const { activeId, sessions, openSession } = get();
    const active = activeId ? sessions[activeId] : undefined;
    if (active?.projectId) await openSession(active.projectId, active.cliId);
  },

  setActive(id) {
    if (!get().sessions[id]) return;
    set({ activeId: id });
    rememberActive(id);
  },

  cycleActive(step) {
    const { order, activeId } = get();
    if (order.length === 0) return;
    const index = activeId ? order.indexOf(activeId) : -1;
    const next = order[(index + step + order.length) % order.length]!;
    get().setActive(next);
  },

  applyServerMessage(id, message) {
    if (message.type === 'replay' || message.type === 'output') return;
    set((s) => {
      const session = s.sessions[id];
      if (!session) return s;
      const patch =
        message.type === 'status'
          ? { status: message.status }
          : message.type === 'exit'
            ? { exitCode: message.code }
            : { previewUrl: message.url, previewDetectedAt: message.detectedAt };
      return { sessions: { ...s.sessions, [id]: { ...session, ...patch } } };
    });
  },

  setConnection(id, connection) {
    set((s) => {
      const session = s.sessions[id];
      if (!session || session.connection === connection) return s;
      return { sessions: { ...s.sessions, [id]: { ...session, connection } } };
    });
  },

  setError(error) {
    set({ error });
  },

  setNotice(notice) {
    set({ notice });
  },
}));
