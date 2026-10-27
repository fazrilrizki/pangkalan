import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import type { RemoteStatus } from '@integrasi/shared';
import { Tailscale, TailscaleNotInstalled } from '../src/remote/tailscale';
import type { TailscaleRunner } from '../src/remote/tailscale';
import { TEST_TOKEN, authHeaders, buildTestApp, makeDataDir, startTestServer } from './helpers';

const REMOTE = 'https://laptop.tail1234.ts.net';
const remoteHeaders = (token = TEST_TOKEN) => ({
  host: 'laptop.tail1234.ts.net',
  origin: REMOTE,
  authorization: `Bearer ${token}`,
  'tailscale-user-login': 'me@github',
});

const STATUS = {
  BackendState: 'Running',
  CertDomains: ['laptop.tail1234.ts.net'],
  Self: { DNSName: 'laptop.tail1234.ts.net.', UserID: 7 },
  User: { '7': { LoginName: 'me@github' } },
};

/** Stands in for the tailscale CLI and records what was asked of it. */
function fakeTailscale(status: unknown = STATUS) {
  const calls: string[] = [];
  let serving = false;
  const run: TailscaleRunner = async (args) => {
    const command = args.join(' ');
    calls.push(command);
    if (status === null) throw new TailscaleNotInstalled();
    if (command === 'status --json') return JSON.stringify(status);
    if (command === 'serve status --json') {
      return serving
        ? JSON.stringify({
            Web: {
              'laptop.tail1234.ts.net:443': {
                Handlers: { '/': { Proxy: 'http://127.0.0.1:4317' } },
              },
            },
          })
        : '{}';
    }
    if (command === 'serve --bg 4317') serving = true;
    if (command === 'serve --https=443 off') serving = false;
    return '';
  };
  return { tailscale: new Tailscale(4317, run), calls };
}

describe('remote access panel', () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  const call = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    headers = authHeaders,
    payload?: unknown,
  ) => app.inject({ method, url, headers, payload: payload as never });

  it('reports a missing tailscale install and refuses to enable', async () => {
    app = await buildTestApp({}, fakeTailscale(null));
    const status = (await call('GET', '/api/remote')).json<RemoteStatus>();
    expect(status).toMatchObject({ viewer: 'local', enabled: false, url: null });
    expect(status.tailscale?.installed).toBe(false);
    const res = await call('POST', '/api/remote/enable');
    expect(res.statusCode).toBe(409);
  });

  it('refuses to enable while HTTPS certificates are off', async () => {
    app = await buildTestApp({}, fakeTailscale({ ...STATUS, CertDomains: null }));
    const res = await call('POST', '/api/remote/enable');
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toContain('HTTPS');
  });

  it('enables with the owner as the only user, then lets that user in', async () => {
    const fake = fakeTailscale();
    app = await buildTestApp({}, fake);
    expect((await call('GET', '/api/health', remoteHeaders())).statusCode).toBe(403);

    const res = await call('POST', '/api/remote/enable');
    expect(res.statusCode).toBe(200);
    const status = res.json<RemoteStatus>();
    expect(status).toMatchObject({ enabled: true, origin: REMOTE, users: ['me@github'] });
    expect(status.url).toBe(`${REMOTE}/?token=${TEST_TOKEN}`);
    expect(status.tailscale?.serving).toBe(true);
    expect(fake.calls).toContain('serve --bg 4317');

    expect((await call('GET', '/api/health', remoteHeaders())).statusCode).toBe(200);
  });

  it('keeps settings out of reach of remote users', async () => {
    app = await buildTestApp({}, fakeTailscale());
    await call('POST', '/api/remote/enable');

    const status = (await call('GET', '/api/remote', remoteHeaders())).json<RemoteStatus>();
    expect(status).toMatchObject({ viewer: 'remote', url: null, tailscale: null });
    for (const [method, url, payload] of [
      ['POST', '/api/remote/disable'],
      ['POST', '/api/remote/rotate-token'],
      ['PUT', '/api/remote/users', { users: ['me@github', 'friend@github'] }],
    ] as const) {
      expect((await call(method, url, remoteHeaders(), payload)).statusCode).toBe(403);
    }
  });

  it('disabling cuts remote access and stops tailscale serve', async () => {
    const fake = fakeTailscale();
    app = await buildTestApp({}, fake);
    await call('POST', '/api/remote/enable');
    const res = await call('POST', '/api/remote/disable');
    expect(res.json<RemoteStatus>().enabled).toBe(false);
    expect(fake.calls).toContain('serve --https=443 off');
    expect((await call('GET', '/api/health', remoteHeaders())).statusCode).toBe(403);
  });

  it('applies allowlist changes immediately and validates logins', async () => {
    app = await buildTestApp({}, fakeTailscale());
    await call('POST', '/api/remote/enable');
    const bad = await call('PUT', '/api/remote/users', authHeaders, { users: ['not a login'] });
    expect(bad.statusCode).toBe(400);

    await call('PUT', '/api/remote/users', authHeaders, { users: ['friend@github'] });
    expect((await call('GET', '/api/health', remoteHeaders())).statusCode).toBe(403);
  });

  it('rotating the token locks out the old one and persists the new one', async () => {
    const dataDir = makeDataDir();
    app = await buildTestApp({ INTEGRASI_DATA_DIR: dataDir }, fakeTailscale());
    await call('POST', '/api/remote/enable');
    const { token } = (await call('POST', '/api/remote/rotate-token')).json<{ token: string }>();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(path.join(dataDir, '.token'), 'utf8')).toBe(token);

    expect((await call('GET', '/api/health', remoteHeaders())).statusCode).toBe(401);
    expect((await call('GET', '/api/health', remoteHeaders(token))).statusCode).toBe(200);
    const local = { ...authHeaders, authorization: `Bearer ${token}` };
    expect((await call('GET', '/api/health', local)).statusCode).toBe(200);
  });

  it('remembers the panel state across restarts', async () => {
    const dataDir = makeDataDir();
    app = await buildTestApp({ INTEGRASI_DATA_DIR: dataDir }, fakeTailscale());
    await call('POST', '/api/remote/enable');
    await app.close();

    app = await buildTestApp({ INTEGRASI_DATA_DIR: dataDir }, fakeTailscale());
    expect((await call('GET', '/api/health', remoteHeaders())).statusCode).toBe(200);
    expect((await call('GET', '/api/remote')).json<RemoteStatus>().source).toBe('panel');
  });
});

describe('open remote terminals', () => {
  it('are closed when remote access is turned off', async () => {
    const { tailscale } = fakeTailscale();
    const server = await startTestServer(4391, { tailscale });
    try {
      await server.api('/api/remote/enable', { method: 'POST' });
      const created = await server.api('/api/sessions', { method: 'POST', body: '{}' });
      const { id } = (await created.json()) as { id: string };

      const ws = new WebSocket(`ws://127.0.0.1:4391/ws/sessions/${id}?token=${TEST_TOKEN}`, {
        headers: {
          origin: REMOTE,
          host: 'laptop.tail1234.ts.net',
          'tailscale-user-login': 'me@github',
        },
      });
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
      });
      const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));

      await server.api('/api/remote/disable', { method: 'POST' });
      expect(await closed).toBe(1008);
    } finally {
      await server.app.close();
    }
  });
});
