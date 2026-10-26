import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SessionInfo } from '@integrasi/shared';
import { WS_CLOSE_SESSION_NOT_FOUND } from '@integrasi/shared';
import { startTestServer, waitFor } from './helpers';

describe('sessions over REST + WebSocket', () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;

  beforeAll(async () => {
    server = await startTestServer(43101);
  });
  afterAll(() => server.app.close());

  async function createSession(): Promise<SessionInfo> {
    const res = await server.api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cwd: process.cwd() }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as SessionInfo;
  }

  it('streams input and output through the WebSocket', async () => {
    const session = await createSession();
    const client = await server.connect(session.id);
    client.send({ type: 'input', data: 'echo ws-roundtrip\r' });
    await waitFor(() => client.output().includes('ws-roundtrip'));
    client.ws.close();
  });

  it('replays scrollback to a client that reconnects', async () => {
    const session = await createSession();
    const first = await server.connect(session.id);
    first.send({ type: 'input', data: 'echo before-reconnect\r' });
    await waitFor(() => first.output().includes('before-reconnect'));
    first.ws.close();

    const second = await server.connect(session.id);
    await waitFor(() => second.messages.some((m) => m.type === 'replay'));
    const replay = second.messages.find((m) => m.type === 'replay');
    expect(replay?.type === 'replay' && replay.data).toContain('before-reconnect');

    second.send({ type: 'input', data: 'echo after-reconnect\r' });
    await waitFor(() => second.output().includes('after-reconnect'));
    second.ws.close();
  });

  it('fans output out to every attached client', async () => {
    const session = await createSession();
    const a = await server.connect(session.id);
    const b = await server.connect(session.id);
    a.send({ type: 'input', data: 'echo fan-out\r' });
    await waitFor(() => a.output().includes('fan-out') && b.output().includes('fan-out'));
    a.ws.close();
    b.ws.close();
  });

  it('ignores malformed client messages without dropping the connection', async () => {
    const session = await createSession();
    const client = await server.connect(session.id);
    client.ws.send('not json');
    client.send({ type: 'resize', cols: 'wide' });
    client.send({ type: 'input', data: 'echo still-alive\r' });
    await waitFor(() => client.output().includes('still-alive'));
    client.ws.close();
  });

  it('lists sessions and removes them', async () => {
    const session = await createSession();
    const list = (await (await server.api('/api/sessions')).json()) as SessionInfo[];
    expect(list.map((s) => s.id)).toContain(session.id);

    const del = await server.api(`/api/sessions/${session.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    const again = await server.api(`/api/sessions/${session.id}`, { method: 'DELETE' });
    expect(again.status).toBe(404);
  });

  it('rejects a cwd that is not a directory', async () => {
    const res = await server.api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cwd: 'Z:\\definitely\\missing' }),
    });
    expect(res.status).toBe(400);
  });

  it('closes the socket with 4404 for an unknown session', async () => {
    const client = await server.connect('missing');
    expect(await client.closed).toBe(WS_CLOSE_SESSION_NOT_FOUND);
  });
});
