import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerMessage, SessionInfo } from '@integrasi/shared';
import { extractLocalUrls } from '../src/sessions/preview-url';
import { startTestServer, waitFor } from './helpers';

describe('extractLocalUrls', () => {
  it('finds a Vite URL inside colored output', () => {
    const vite =
      '  \x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\r\n';
    expect(extractLocalUrls(vite)).toEqual(['http://localhost:5173/']);
  });

  it('normalizes wildcard and IPv6 hosts to localhost', () => {
    expect(extractLocalUrls('on http://0.0.0.0:3000 and http://[::1]:8080/app')).toEqual([
      'http://localhost:3000',
      'http://localhost:8080/app',
    ]);
  });

  it('keeps 127.0.0.1 and https', () => {
    expect(extractLocalUrls('https://127.0.0.1:8443/x')).toEqual(['https://127.0.0.1:8443/x']);
  });

  it('drops trailing punctuation from prose', () => {
    expect(extractLocalUrls('Server running at http://localhost:3000/.')).toEqual([
      'http://localhost:3000/',
    ]);
    expect(extractLocalUrls('(see http://localhost:4000)')).toEqual(['http://localhost:4000']);
  });

  it('ignores listed ports and non-local hosts', () => {
    expect(
      extractLocalUrls(
        'hook http://127.0.0.1:4317/api/hooks/x, site http://example.com:80, app http://localhost:5173',
        { ignorePorts: [4317] },
      ),
    ).toEqual(['http://localhost:5173']);
  });

  it('waits for the rest of a URL cut off at the end of a stream chunk', () => {
    expect(extractLocalUrls('Local: http://localhost:51', { streaming: true })).toEqual([]);
    expect(extractLocalUrls('Local: http://localhost:5173/\r\n', { streaming: true })).toEqual([
      'http://localhost:5173/',
    ]);
  });

  it('returns nothing without a port', () => {
    expect(extractLocalUrls('http://localhost/ and plain text')).toEqual([]);
  });
});

describe('preview URL over the WebSocket with a fake CLI', () => {
  const PORT = 43108;
  let server: Awaited<ReturnType<typeof startTestServer>>;

  beforeAll(async () => {
    server = await startTestServer(PORT);
  });
  afterAll(() => server.app.close());

  const previews = (messages: ServerMessage[]) =>
    messages.flatMap((m) => (m.type === 'preview' ? [m.url] : []));

  it('reports the last dev-server URL, skipping Pangkalan itself', async () => {
    const res = await server.api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cliId: 'fake', cwd: process.cwd() }),
    });
    const info = (await res.json()) as SessionInfo;
    expect(info.previewUrl).toBeNull();
    const client = await server.connect(info.id);
    await waitFor(() => client.output().includes('fake-cli ready'));

    client.send({ type: 'input', data: `serve http://127.0.0.1:${PORT}/api/hooks/x` });
    client.send({ type: 'input', data: 'serve http://localhost:5173/' });
    await waitFor(() => previews(client.messages).length > 0);
    expect(previews(client.messages)).toEqual(['http://localhost:5173/']);

    const list = (await (await server.api('/api/sessions')).json()) as SessionInfo[];
    const listed = list.find((s) => s.id === info.id);
    expect(listed?.previewUrl).toBe('http://localhost:5173/');
    expect(listed?.previewDetectedAt).toEqual(expect.any(String));

    const late = await server.connect(info.id);
    await waitFor(() => previews(late.messages).length > 0);
    expect(previews(late.messages)).toEqual(['http://localhost:5173/']);
    client.ws.close();
    late.ws.close();
  });
});
