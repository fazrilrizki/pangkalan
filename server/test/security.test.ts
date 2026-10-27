import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadRemoteConfig } from '../src/config';
import { loadOrCreateToken } from '../src/security/auth';
import { APP_ORIGIN, TEST_TOKEN, authHeaders, buildTestApp, testConfig } from './helpers';

describe('security layer', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  const get = (url: string, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url, headers });

  it('accepts a valid token from an allowed origin', async () => {
    const res = await get('/api/health', {
      host: '127.0.0.1:4317',
      origin: APP_ORIGIN,
      authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('accepts requests proxied by the Vite dev server', async () => {
    const res = await get('/api/health', {
      host: '127.0.0.1:5173',
      origin: 'http://127.0.0.1:5173',
      authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a missing token with 401', async () => {
    const res = await get('/api/health', { host: '127.0.0.1:4317' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong token with 401', async () => {
    const res = await get('/api/health', {
      host: '127.0.0.1:4317',
      authorization: `Bearer ${'b'.repeat(64)}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a foreign origin with 403 even with a valid token', async () => {
    const res = await get('/api/health', {
      host: '127.0.0.1:4317',
      origin: 'https://evil.example',
      authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a foreign Host header with 403 (DNS rebinding)', async () => {
    const res = await get('/api/health', {
      host: 'evil.example:4317',
      authorization: `Bearer ${TEST_TOKEN}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a WS path without a token', async () => {
    const res = await get('/ws/sessions/x', { host: '127.0.0.1:4317', origin: APP_ORIGIN });
    expect(res.statusCode).toBe(401);
  });

  it('lets a WS path with the token in the query string past the auth layer', async () => {
    const res = await get(`/ws/sessions/x?token=${TEST_TOKEN}`, {
      host: '127.0.0.1:4317',
      origin: APP_ORIGIN,
    });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });

  it('does not accept the token in the query string for REST', async () => {
    const res = await get(`/api/health?token=${TEST_TOKEN}`, { host: '127.0.0.1:4317' });
    expect(res.statusCode).toBe(401);
  });

  it('drops dev origins in production', async () => {
    const prod = await buildTestApp({ NODE_ENV: 'production' });
    const res = await prod.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        host: '127.0.0.1:4317',
        origin: 'http://127.0.0.1:5173',
        authorization: `Bearer ${TEST_TOKEN}`,
      },
    });
    expect(res.statusCode).toBe(403);
    await prod.close();
  });
});

describe('loadOrCreateToken', () => {
  it('creates a token once and reuses it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrasi-token-'));
    const first = loadOrCreateToken(dir, {});
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(loadOrCreateToken(dir, {})).toBe(first);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prefers INTEGRASI_TOKEN when set', () => {
    expect(loadOrCreateToken(os.tmpdir(), { INTEGRASI_TOKEN: 'from-env' })).toBe('from-env');
  });
});

describe('static web app', () => {
  it('serves the built page without a token but still checks the Host header', async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'integrasi-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>ok</title>');
    const app = await buildApp({
      config: testConfig({}, { webDistDir: dist }),
      token: TEST_TOKEN,
    });
    const page = await app.inject({ method: 'GET', url: '/', headers: { host: '127.0.0.1:4317' } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>ok</title>');
    const rebound = await app.inject({
      method: 'GET',
      url: '/',
      headers: { host: 'evil.example' },
    });
    expect(rebound.statusCode).toBe(403);
    await app.close();
  });
});

describe('remote access via tailscale serve', () => {
  const REMOTE = 'https://laptop.tail1234.ts.net';
  const remoteEnv = { PANGKALAN_REMOTE_ORIGIN: REMOTE, PANGKALAN_REMOTE_USERS: 'me@github' };
  const remoteHeaders = {
    host: 'laptop.tail1234.ts.net',
    origin: REMOTE,
    authorization: `Bearer ${TEST_TOKEN}`,
    'tailscale-user-login': 'me@github',
  };

  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildTestApp(remoteEnv);
  });
  afterAll(() => app.close());

  const get = (url: string, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url, headers });

  it('accepts an allowed tailnet user with the token', async () => {
    expect((await get('/api/health', remoteHeaders)).statusCode).toBe(200);
  });

  it('still requires the token', async () => {
    const { authorization: _, ...headers } = remoteHeaders;
    expect((await get('/api/health', headers)).statusCode).toBe(401);
  });

  it('rejects a missing identity header (e.g. Funnel traffic)', async () => {
    const { 'tailscale-user-login': _, ...headers } = remoteHeaders;
    expect((await get('/api/health', headers)).statusCode).toBe(403);
  });

  it('rejects a user outside the allowlist', async () => {
    const res = await get('/api/health', { ...remoteHeaders, 'tailscale-user-login': 'x@github' });
    expect(res.statusCode).toBe(403);
  });

  it('checks identity even when the proxy forwards a local Host', async () => {
    const headers = {
      ...remoteHeaders,
      host: '127.0.0.1:4317',
      'x-forwarded-host': 'laptop.tail1234.ts.net',
    };
    expect((await get('/api/health', headers)).statusCode).toBe(200);
    const { 'tailscale-user-login': _, ...anonymous } = headers;
    expect((await get('/api/health', anonymous)).statusCode).toBe(403);
    const foreign = { ...headers, 'x-forwarded-host': 'evil.example' };
    expect((await get('/api/health', foreign)).statusCode).toBe(403);
  });

  it('never exposes the hooks endpoint remotely', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hooks/x',
      headers: remoteHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects remote requests when remote access is off', async () => {
    const local = await buildTestApp();
    const res = await local.inject({ method: 'GET', url: '/api/health', headers: remoteHeaders });
    expect(res.statusCode).toBe(403);
    const proxied = await local.inject({
      method: 'GET',
      url: '/api/health',
      headers: { ...authHeaders, 'tailscale-user-login': 'me@github' },
    });
    expect(proxied.statusCode).toBe(403);
    await local.close();
  });
});

describe('loadRemoteConfig', () => {
  it('is off by default', () => {
    expect(loadRemoteConfig({})).toBeNull();
  });

  it('parses origin and users', () => {
    expect(
      loadRemoteConfig({
        PANGKALAN_REMOTE_ORIGIN: 'https://a.b.ts.net',
        PANGKALAN_REMOTE_USERS: ' me@github , you@github ',
      }),
    ).toEqual({ origin: 'https://a.b.ts.net', users: ['me@github', 'you@github'] });
  });

  it.each([
    ['http://a.b.ts.net', 'me@github'],
    ['https://example.com', 'me@github'],
    ['https://a.b.ts.net/path', 'me@github'],
    ['https://a.b.ts.net', ''],
    ['', 'me@github'],
  ])('rejects origin %j with users %j', (origin, users) => {
    expect(() =>
      loadRemoteConfig({ PANGKALAN_REMOTE_ORIGIN: origin, PANGKALAN_REMOTE_USERS: users }),
    ).toThrow();
  });
});
