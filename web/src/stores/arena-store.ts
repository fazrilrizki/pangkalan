import { create } from 'zustand';
import type {
  Arena,
  ArenaCreated,
  ArenaEntryDiff,
  CreateArenaInput,
  SessionInfo,
} from '@integrasi/shared';
import { apiFetch } from '../lib/api';
import { useAppStore } from './app-store';

export type ArenaLayout = 'grid' | 'single';

interface ArenaState {
  arenas: Arena[];
  /** Per arena: contestants side by side, or one at a time like normal tabs. */
  layout: Record<string, ArenaLayout>;
  /** Arena whose compare dialog is open. */
  comparingId: string | null;

  load(): Promise<void>;
  create(input: CreateArenaInput): Promise<void>;
  diff(id: string): Promise<ArenaEntryDiff[]>;
  pickWinner(id: string, letter: string): Promise<void>;
  discard(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  sendPrompt(id: string, letter: string): Promise<void>;
  reopen(id: string, letter: string): Promise<void>;
  setLayout(id: string, layout: ArenaLayout): void;
  setComparing(id: string | null): void;
}

const post = <T>(path: string, body: unknown = {}) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

/** The running arena a session belongs to, if any. */
export function arenaOf(arenas: Arena[], sessionId: string | null): Arena | undefined {
  if (!sessionId) return undefined;
  return arenas.find(
    (a) => a.status === 'running' && a.entries.some((e) => e.sessionId === sessionId),
  );
}

export const useArenaStore = create<ArenaState>()((set, get) => {
  function replace(arena: Arena) {
    set((s) => ({ arenas: s.arenas.map((a) => (a.id === arena.id ? arena : a)) }));
  }

  /** Winner and discard end every contestant on the server; mirror that in the tabs. */
  async function finish(id: string, action: () => Promise<Arena>) {
    const before = get().arenas.find((a) => a.id === id);
    const arena = await action();
    replace(arena);
    const ids = before?.entries.map((e) => e.sessionId).filter((x): x is string => x !== null);
    const app = useAppStore.getState();
    app.dropSessions(ids ?? []);
    const branches = arena.entries.map((e) => e.branch).join(', ');
    app.setNotice(
      arena.status === 'merged'
        ? `Pemenang ${arena.winner} di-merge ke ${arena.baseBranch}. Hasil semua peserta tersimpan di branch ${branches}.`
        : `Adu dibatalkan. Hasil semua peserta tersimpan di branch ${branches}.`,
    );
    set({ comparingId: null });
  }

  return {
    arenas: [],
    layout: {},
    comparingId: null,

    async load() {
      set({ arenas: await apiFetch<Arena[]>('/api/arenas') });
    },

    async create(input) {
      const { arena, sessions } = await post<ArenaCreated>('/api/arenas', input);
      set((s) => ({ arenas: [...s.arenas, arena], layout: { ...s.layout, [arena.id]: 'grid' } }));
      useAppStore.getState().addSessions(sessions);
    },

    diff: (id) => apiFetch<ArenaEntryDiff[]>(`/api/arenas/${id}/diff`),

    pickWinner: (id, letter) =>
      finish(id, () => post<Arena>(`/api/arenas/${id}/winner`, { letter })),

    discard: (id) => finish(id, () => post<Arena>(`/api/arenas/${id}/discard`)),

    async remove(id) {
      await apiFetch(`/api/arenas/${id}`, { method: 'DELETE' });
      set((s) => ({ arenas: s.arenas.filter((a) => a.id !== id) }));
    },

    async sendPrompt(id, letter) {
      await post(`/api/arenas/${id}/entries/${letter}/prompt`);
      await get().load();
    },

    async reopen(id, letter) {
      const info = await post<SessionInfo>(`/api/arenas/${id}/entries/${letter}/reopen`);
      useAppStore.getState().addSessions([info]);
      await get().load();
    },

    setLayout(id, layout) {
      set((s) => ({ layout: { ...s.layout, [id]: layout } }));
    },

    setComparing(id) {
      set({ comparingId: id });
    },
  };
});
