import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Arena,
  ArenaCreated,
  ArenaEntryDiff,
  Project,
  ProjectGitInfo,
} from '@integrasi/shared';
import { looksLikeMenu, parseNumstat } from '../src/arenas/arena-manager';
import { startTestServer, waitFor } from './helpers';

const gitIn = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@localhost', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrasi-arena-'));
  gitIn(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'README.md'), 'base\n');
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

describe('arenas', () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;
  beforeAll(async () => {
    server = await startTestServer(43120);
  });
  afterAll(() => server.app.close());

  const json = async <T>(res: Response, status: number): Promise<T> => {
    expect(res.status, await res.clone().text()).toBe(status);
    return (await res.json()) as T;
  };
  const post = (url: string, body: unknown = {}) =>
    server.api(url, { method: 'POST', body: JSON.stringify(body) });

  async function addProject(dir: string): Promise<Project> {
    return json<Project>(await post('/api/projects', { path: dir }), 201);
  }

  async function startArena(projectId: string, prompt: string): Promise<ArenaCreated> {
    return json<ArenaCreated>(
      await post('/api/arenas', {
        projectId,
        prompt,
        entries: [{ cliId: 'fake' }, { cliId: 'fake', extraArgs: ['--model', 'x'] }],
      }),
      201,
    );
  }

  it('types the prompt into every contestant and merges the winner', async () => {
    const repo = makeRepo();
    const project = await addProject(repo);
    const info = await json<ProjectGitInfo>(
      await server.api(`/api/projects/${project.id}/git`),
      200,
    );
    expect(info).toEqual({ isRepo: true, branch: 'main', dirty: false });

    const { arena, sessions } = await startArena(project.id, 'write result.txt from-arena');
    expect(sessions.map((s) => s.title)).toEqual(['A · Fake CLI', 'B · Fake CLI · x']);
    for (const entry of arena.entries) {
      await waitFor(() => fs.existsSync(path.join(entry.worktree, 'result.txt')), 15_000);
    }

    const diffs = await json<ArenaEntryDiff[]>(
      await server.api(`/api/arenas/${arena.id}/diff`),
      200,
    );
    for (const diff of diffs) {
      expect(diff.files).toEqual([{ path: 'result.txt', added: 1, removed: 0, binary: false }]);
      expect(diff.patch).toContain('+from-arena');
    }

    const merged = await json<Arena>(
      await post(`/api/arenas/${arena.id}/winner`, { letter: 'A' }),
      200,
    );
    expect(merged).toMatchObject({ status: 'merged', winner: 'A' });
    expect(fs.readFileSync(path.join(repo, 'result.txt'), 'utf8').trim()).toBe('from-arena');
    for (const entry of arena.entries) expect(fs.existsSync(entry.worktree)).toBe(false);
    // The loser's work is kept on its branch.
    const loser = arena.entries[1]!.branch;
    expect(gitIn(repo, 'show', `${loser}:result.txt`)).toBe('from-arena');
  }, 30_000);

  it('refuses to merge into a base with uncommitted changes', async () => {
    const repo = makeRepo();
    const project = await addProject(repo);
    const { arena } = await startArena(project.id, 'echo hi');
    fs.writeFileSync(path.join(repo, 'README.md'), 'edited\n');

    const res = await post(`/api/arenas/${arena.id}/winner`, { letter: 'B' });
    expect(res.status).toBe(409);
    // Nothing was stopped: the contestants keep running.
    const [listed] = (await json<Arena[]>(await server.api('/api/arenas'), 200)).filter(
      (a) => a.id === arena.id,
    );
    expect(listed!.entries.every((e) => e.sessionId !== null)).toBe(true);

    const discarded = await json<Arena>(await post(`/api/arenas/${arena.id}/discard`), 200);
    expect(discarded.status).toBe('discarded');
    expect(fs.existsSync(arena.entries[0]!.worktree)).toBe(false);
    expect((await server.api(`/api/arenas/${arena.id}`, { method: 'DELETE' })).status).toBe(204);
  }, 30_000);

  it('holds the prompt while the CLI shows a menu, then sends it once answered', async () => {
    const repo = makeRepo();
    const project = await addProject(repo);
    const { arena, sessions } = await json<ArenaCreated>(
      await post('/api/arenas', {
        projectId: project.id,
        prompt: 'write menu.txt after-menu',
        entries: [{ cliId: 'fake-menu' }, { cliId: 'fake-menu' }],
      }),
      201,
    );
    // Long enough for the CLI to go idle on the menu; the prompt must not have been typed.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const [listed] = (await json<Arena[]>(await server.api('/api/arenas'), 200)).filter(
      (a) => a.id === arena.id,
    );
    expect(listed!.entries.map((e) => e.prompt)).toEqual(['pending', 'pending']);

    for (const session of sessions) {
      const client = await server.connect(session.id);
      client.send({ type: 'input', data: '\r' });
      client.ws.close();
    }
    for (const entry of arena.entries) {
      await waitFor(() => fs.existsSync(path.join(entry.worktree, 'menu.txt')), 15_000);
    }
    await json<Arena>(await post(`/api/arenas/${arena.id}/discard`), 200);
  }, 30_000);

  it('passes the prompt as an argument, quotes intact, when the CLI supports it', async () => {
    const repo = makeRepo();
    const project = await addProject(repo);
    const { arena } = await json<ArenaCreated>(
      await post('/api/arenas', {
        projectId: project.id,
        prompt: 'write quoted.txt say "hi" & it\'s C:\\dir\\',
        entries: [{ cliId: 'fake-arg' }, { cliId: 'fake-arg', extraArgs: ['--model', 'x'] }],
      }),
      201,
    );
    expect(arena.entries.map((e) => e.prompt)).toEqual(['sent', 'sent']);
    for (const entry of arena.entries) {
      const file = path.join(entry.worktree, 'quoted.txt');
      await waitFor(() => fs.existsSync(file), 15_000);
      expect(fs.readFileSync(file, 'utf8')).toBe('say "hi" & it\'s C:\\dir\\\n');
    }
    await json<Arena>(await post(`/api/arenas/${arena.id}/discard`), 200);
  }, 30_000);

  it('rejects a project that is not a git repo', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrasi-norepo-'));
    const project = await addProject(dir);
    const res = await post('/api/arenas', {
      projectId: project.id,
      prompt: 'x',
      entries: [{ cliId: 'fake' }, { cliId: 'fake' }],
    });
    expect(res.status).toBe(400);
  });
});

describe('looksLikeMenu', () => {
  it.each([
    ['❯ No, exit\n  Yes, I trust this folder\nEnter to confirm · Esc to cancel', true],
    ['Do you want to proceed?\n❯ 1. Yes\n  2. No', true],
    ['Continue? (y/n) ', true],
    ['╭──────╮\n│ > │\n╰──────╯\n  ? for shortcuts', false],
  ])('%j -> %s', (text, expected) => {
    expect(looksLikeMenu(text)).toBe(expected);
  });
});

describe('parseNumstat', () => {
  it('reads text and binary rows', () => {
    expect(parseNumstat('3\t1\tsrc/a.ts\n-\t-\timg.png')).toEqual([
      { path: 'src/a.ts', added: 3, removed: 1, binary: false },
      { path: 'img.png', added: 0, removed: 0, binary: true },
    ]);
  });
});
