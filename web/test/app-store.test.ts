import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionInfo } from '@integrasi/shared';
import { useAppStore } from '../src/stores/app-store';

const session = (id: string, createdAt: string, extra: Partial<SessionInfo> = {}): SessionInfo => ({
  id,
  projectId: 'p1',
  cliId: 'claude',
  title: 'Claude Code',
  cwd: 'C:\\p1',
  status: 'idle',
  exitCode: null,
  createdAt,
  ...extra,
});

type Route = (init: RequestInit | undefined) => unknown;

function mockApi(routes: Record<string, Route>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url}`;
      calls.push(key);
      const route = routes[key];
      if (!route) return new Response(JSON.stringify({ error: 'no route' }), { status: 404 });
      const body = route(init);
      return body === undefined
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return calls;
}

const initialState = useAppStore.getState();

describe('app store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(initialState, true);
  });
  afterEach(() => vi.unstubAllGlobals());

  const baseRoutes = (sessions: SessionInfo[]): Record<string, Route> => ({
    'GET /api/projects': () => [],
    'GET /api/clis': () => ({ clis: [] }),
    'GET /api/sessions': () => sessions,
  });

  it('restores open sessions as tabs in creation order', async () => {
    mockApi(baseRoutes([session('b', '2026-01-02'), session('a', '2026-01-01')]));
    await useAppStore.getState().load();
    const state = useAppStore.getState();
    expect(state.order).toEqual(['a', 'b']);
    expect(state.activeId).toBe('a');
    expect(state.sessions.a?.connection).toBe('connecting');
  });

  it('restores the remembered active tab when it still exists', async () => {
    localStorage.setItem('integrasi.activeSession', 'b');
    mockApi(baseRoutes([session('a', '2026-01-01'), session('b', '2026-01-02')]));
    await useAppStore.getState().load();
    expect(useAppStore.getState().activeId).toBe('b');
  });

  it('falls back to the first tab when the remembered one is gone', async () => {
    localStorage.setItem('integrasi.activeSession', 'zzz');
    mockApi(baseRoutes([session('a', '2026-01-01')]));
    await useAppStore.getState().load();
    expect(useAppStore.getState().activeId).toBe('a');
  });

  it('opens a session as a new active tab', async () => {
    mockApi({
      ...baseRoutes([session('a', '2026-01-01')]),
      'POST /api/sessions': (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ projectId: 'p1', cliId: 'claude' });
        return session('new', '2026-01-03');
      },
    });
    await useAppStore.getState().load();
    await useAppStore.getState().openSession('p1', 'claude');
    expect(useAppStore.getState().order).toEqual(['a', 'new']);
    expect(useAppStore.getState().activeId).toBe('new');
    expect(localStorage.getItem('integrasi.activeSession')).toBe('new');
  });

  it('closing the active tab activates its neighbour', async () => {
    const calls = mockApi({
      ...baseRoutes([
        session('a', '2026-01-01'),
        session('b', '2026-01-02'),
        session('c', '2026-01-03'),
      ]),
      'DELETE /api/sessions/b': () => undefined,
      'DELETE /api/sessions/c': () => undefined,
    });
    await useAppStore.getState().load();
    useAppStore.getState().setActive('b');
    await useAppStore.getState().closeSession('b');
    expect(useAppStore.getState().order).toEqual(['a', 'c']);
    expect(useAppStore.getState().activeId).toBe('c');
    await useAppStore.getState().closeSession('c');
    expect(useAppStore.getState().activeId).toBe('a');
    expect(calls).toContain('DELETE /api/sessions/b');
  });

  it('drops the tab even if the server already forgot the session', async () => {
    mockApi(baseRoutes([session('a', '2026-01-01')]));
    await useAppStore.getState().load();
    await useAppStore.getState().closeSession('a');
    expect(useAppStore.getState().order).toEqual([]);
    expect(useAppStore.getState().activeId).toBeNull();
  });

  it('cycles tabs in both directions with wrap-around', async () => {
    mockApi(baseRoutes([session('a', '1'), session('b', '2'), session('c', '3')]));
    await useAppStore.getState().load();
    const { cycleActive } = useAppStore.getState();
    cycleActive(-1);
    expect(useAppStore.getState().activeId).toBe('c');
    cycleActive(1);
    expect(useAppStore.getState().activeId).toBe('a');
  });

  it('applies status and exit messages to the right session', async () => {
    mockApi(baseRoutes([session('a', '1'), session('b', '2')]));
    await useAppStore.getState().load();
    const { applyServerMessage } = useAppStore.getState();
    applyServerMessage('a', { type: 'status', status: 'waiting' });
    applyServerMessage('b', { type: 'exit', code: 3 });
    applyServerMessage('a', { type: 'output', data: 'ignored' });
    const { sessions } = useAppStore.getState();
    expect(sessions.a?.status).toBe('waiting');
    expect(sessions.b?.exitCode).toBe(3);
  });
});
