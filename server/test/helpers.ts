import WebSocket from 'ws';
import type { ServerMessage } from '@integrasi/shared';
import type { AppOptions } from '../src/app';
import { buildApp } from '../src/app';
import type { ServerConfig } from '../src/config';
import { loadConfig } from '../src/config';

export const TEST_TOKEN = 'a'.repeat(64);
export const APP_ORIGIN = 'http://127.0.0.1:4317';
export const authHeaders = { host: '127.0.0.1:4317', authorization: `Bearer ${TEST_TOKEN}` };

export const TEST_SHELL = { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] };

export function testConfig(env: NodeJS.ProcessEnv = {}, overrides: Partial<ServerConfig> = {}) {
  return { ...loadConfig({ NODE_ENV: 'test', ...env }), shell: TEST_SHELL, ...overrides };
}

export async function buildTestApp(
  env: NodeJS.ProcessEnv = {},
  options: Partial<Omit<AppOptions, 'config' | 'token'>> = {},
) {
  return buildApp({ config: testConfig(env), token: TEST_TOKEN, ...options });
}

/** Starts a real HTTP server so WebSocket and PTY behaviour can be exercised end to end. */
export async function startTestServer(
  port: number,
  options: Partial<Omit<AppOptions, 'config' | 'token'>> = {},
) {
  const app = await buildTestApp({ PORT: String(port) }, options);
  await app.listen({ host: '127.0.0.1', port });
  const origin = `http://127.0.0.1:${port}`;
  return {
    app,
    origin,
    api: (path: string, init: RequestInit = {}) =>
      fetch(origin + path, {
        ...init,
        headers: {
          authorization: `Bearer ${TEST_TOKEN}`,
          ...(init.body !== undefined && { 'content-type': 'application/json' }),
          ...init.headers,
        },
      }),
    connect: (sessionId: string) => connectWs(`${origin}/ws/sessions/${sessionId}`, origin),
  };
}

export interface TestSocket {
  ws: WebSocket;
  messages: ServerMessage[];
  output: () => string;
  send: (message: unknown) => void;
  closed: Promise<number>;
}

export async function connectWs(httpUrl: string, origin: string): Promise<TestSocket> {
  const url = `${httpUrl.replace(/^http/, 'ws')}?token=${TEST_TOKEN}`;
  const ws = new WebSocket(url, { headers: { origin } });
  const messages: ServerMessage[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString()) as ServerMessage));
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return {
    ws,
    messages,
    output: () =>
      messages
        .filter((m) => m.type === 'output' || m.type === 'replay')
        .map((m) => (m as { data: string }).data)
        .join(''),
    send: (message) => ws.send(JSON.stringify(message)),
    closed,
  };
}

export function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('waitFor timed out'));
      }
    }, 25);
  });
}
