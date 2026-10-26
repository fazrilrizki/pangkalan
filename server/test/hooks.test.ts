import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SessionInfo } from '@integrasi/shared';
import { prepareClaudeHooks, statusFromHook } from '../src/sessions/claude-hooks';
import { SessionManager } from '../src/sessions/session-manager';
import { startTestServer, waitFor } from './helpers';

describe('statusFromHook', () => {
  it('maps Claude Code hook events to statuses', () => {
    expect(statusFromHook({ hook_event_name: 'UserPromptSubmit' })).toBe('working');
    expect(statusFromHook({ hook_event_name: 'PreToolUse', tool_name: 'Bash' })).toBe('working');
    expect(statusFromHook({ hook_event_name: 'Stop' })).toBe('idle');
    expect(
      statusFromHook({ hook_event_name: 'Notification', notification_type: 'permission_prompt' }),
    ).toBe('waiting');
    expect(
      statusFromHook({ hook_event_name: 'Notification', notification_type: 'auth_success' }),
    ).toBeNull();
    expect(statusFromHook({ hook_event_name: 'SomethingNew' })).toBeNull();
    expect(statusFromHook('garbage')).toBeNull();
  });
});

describe('prepareClaudeHooks', () => {
  it('writes HTTP hooks with a per-session secret and removes them on cleanup', () => {
    const setup = prepareClaudeHooks('abc', 4317);
    const settings = JSON.parse(fs.readFileSync(setup.settingsFile, 'utf8')) as {
      hooks: Record<string, { hooks: { type: string; url: string; headers: object }[] }[]>;
    };
    expect(setup.args).toEqual(['--settings', setup.settingsFile]);
    const handler = settings.hooks.Notification?.[0]?.hooks[0];
    expect(handler).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:4317/api/hooks/abc',
      headers: { 'x-hook-secret': setup.secret },
      timeout: 5,
    });
    expect(Object.keys(settings.hooks)).toEqual(
      expect.arrayContaining(['UserPromptSubmit', 'PreToolUse', 'Notification', 'Stop']),
    );
    setup.cleanup();
    expect(fs.existsSync(setup.settingsFile)).toBe(false);
  });
});

describe('hook endpoint', () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;
  beforeAll(async () => {
    const sessions = new SessionManager({ statusIntervalMs: 50, status: { idleAfterMs: 300 } });
    server = await startTestServer(43106, { sessions });
  });
  afterAll(() => server.app.close());

  async function startHookedSession() {
    const res = await server.api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cliId: 'fake-hooks', cwd: process.cwd() }),
    });
    const info = (await res.json()) as SessionInfo;
    const file = path.join(os.tmpdir(), 'integrasi-ai', `claude-hooks-${info.id}.json`);
    const settings = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      hooks: { Stop: { hooks: { url: string; headers: Record<string, string> }[] }[] };
    };
    const { url, headers } = settings.hooks.Stop[0]!.hooks[0]!;
    const post = (payload: unknown, secret = headers['x-hook-secret']!) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hook-secret': secret },
        body: JSON.stringify(payload),
      });
    return { info, file, post };
  }

  it('passes --settings to the CLI and turns hook calls into status updates', async () => {
    const { info, post } = await startHookedSession();
    const client = await server.connect(info.id);
    await waitFor(() => client.output().includes('fake-cli ready'));

    const res = await post({
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
    });
    expect(res.status).toBe(204);
    await waitFor(() => client.messages.some((m) => m.type === 'status' && m.status === 'waiting'));

    await post({ hook_event_name: 'Stop' });
    await waitFor(() => {
      const last = client.messages.filter((m) => m.type === 'status').at(-1);
      return last?.type === 'status' && last.status === 'idle';
    });
    client.ws.close();
  });

  it('rejects a wrong secret and an unknown session without needing the app token', async () => {
    const { info, post } = await startHookedSession();
    expect((await post({ hook_event_name: 'Stop' }, 'wrong')).status).toBe(401);
    const unknown = await fetch(`${server.origin}/api/hooks/nope`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hook-secret': 'x' },
      body: '{}',
    });
    expect(unknown.status).toBe(404);
    await server.api(`/api/sessions/${info.id}`, { method: 'DELETE' });
  });

  it('rejects hooks for sessions that were not started in hooks mode', async () => {
    const res = await server.api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cliId: 'fake', cwd: process.cwd() }),
    });
    const info = (await res.json()) as SessionInfo;
    const hook = await fetch(`${server.origin}/api/hooks/${info.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hook-secret': '' },
      body: '{}',
    });
    expect(hook.status).toBe(401);
  });

  it('never exposes the secret and deletes the settings file when the session ends', async () => {
    const { info, file } = await startHookedSession();
    const list = await (await server.api('/api/sessions')).text();
    expect(list).not.toContain('hookSecret');
    expect(list).not.toContain('secret');

    await server.api(`/api/sessions/${info.id}`, { method: 'DELETE' });
    await waitFor(() => !fs.existsSync(file));
  });
});
