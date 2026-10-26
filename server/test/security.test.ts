import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadOrCreateToken } from '../src/security/auth';
import { APP_ORIGIN, TEST_TOKEN, buildTestApp, testConfig } from './helpers';

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
