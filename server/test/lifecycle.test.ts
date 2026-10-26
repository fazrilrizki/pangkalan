import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SessionInfo } from '@integrasi/shared';
import { SessionManager } from '../src/sessions/session-manager';
import { startTestServer, waitFor } from './helpers';

function childPids(pid: number): number[] {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}').ProcessId`,
    ],
    { encoding: 'utf8' },
  );
  return out
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('session lifecycle', () => {
  const sessions = new SessionManager();
  let server: Awaited<ReturnType<typeof startTestServer>>;

  beforeAll(async () => {
    server = await startTestServer(43104, { sessions });
  });
  afterAll(() => server.app.close());

  async function startFake(): Promise<SessionInfo> {
    const res = await server.api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cliId: 'fake', cwd: process.cwd() }),
    });
    return (await res.json()) as SessionInfo;
  }

  it('kills the CLI started by the shell, not only the shell', async () => {
    const info = await startFake();
    const client = await server.connect(info.id);
    await waitFor(() => client.output().includes('fake-cli ready'));

    const shellPid = sessions.get(info.id)!.pid;
    const children = childPids(shellPid).filter((pid) => pid !== shellPid);
    expect(children.length).toBeGreaterThan(0);

    const res = await server.api(`/api/sessions/${info.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    await waitFor(() => !isAlive(shellPid) && children.every((pid) => !isAlive(pid)), 10_000);
    await waitFor(() => client.messages.some((m) => m.type === 'status' && m.status === 'exited'));
  });

  it('reports a clean exit as exited with code 0', async () => {
    const info = await startFake();
    const client = await server.connect(info.id);
    await waitFor(() => client.output().includes('fake-cli ready'));
    client.send({ type: 'input', data: 'exit 0\r' });
    await waitFor(() => client.messages.some((m) => m.type === 'exit'));
    expect(client.messages).toContainEqual({ type: 'exit', code: 0 });
    expect(sessions.get(info.id)?.info()).toMatchObject({ status: 'exited', exitCode: 0 });
  });

  it('reports a failing exit as error and keeps the session until it is closed', async () => {
    const info = await startFake();
    const client = await server.connect(info.id);
    await waitFor(() => client.output().includes('fake-cli ready'));
    client.send({ type: 'input', data: 'exit 3\r' });
    await waitFor(() => client.messages.some((m) => m.type === 'exit'));
    expect(sessions.get(info.id)?.info()).toMatchObject({ status: 'error', exitCode: 3 });

    // A late client still learns that the process has ended.
    const late = await server.connect(info.id);
    await waitFor(() => late.messages.some((m) => m.type === 'exit'));

    expect((await server.api(`/api/sessions/${info.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(sessions.get(info.id)).toBeUndefined();
  });
});
