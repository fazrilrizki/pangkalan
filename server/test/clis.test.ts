import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CliInfo, SessionInfo } from '@integrasi/shared';
import { CliRegistry, cliLaunchArgs } from '../src/clis/cli-registry';
import { loadConfig } from '../src/config';
import { TEST_SHELL, makeDataDir, startTestServer, waitFor } from './helpers';

const exampleFile = loadConfig({}).cliExampleFile;

function registryFor(clisFile: unknown) {
  const dir = makeDataDir(clisFile);
  const file = path.join(dir, 'clis.json');
  return {
    file,
    registry: new CliRegistry({ file, exampleFile, fallbackShell: TEST_SHELL }),
  };
}

describe('CliRegistry', () => {
  it('seeds clis.json from the example with Claude enabled and Antigravity disabled', () => {
    const dir = makeDataDir();
    const file = path.join(dir, 'fresh.json');
    const registry = new CliRegistry({ file, exampleFile, fallbackShell: TEST_SHELL });
    expect(fs.existsSync(file)).toBe(true);
    expect(registry.get('claude')).toMatchObject({ enabled: true, statusMode: 'hooks' });
    expect(registry.get('antigravity')).toMatchObject({ enabled: false });
    expect(registry.errors).toEqual([]);
  });

  it('skips invalid and duplicate entries but keeps the valid ones', () => {
    const { registry } = registryFor({
      clis: [
        { id: 'good', name: 'Good', command: 'good' },
        { id: 'Bad Id', name: 'x', command: 'x' },
        { id: 'regex', name: 'x', command: 'x', waitingPatterns: ['('] },
        { id: 'good', name: 'Dup', command: 'dup' },
      ],
    });
    expect(registry.list().map((c) => c.id)).toEqual(['good']);
    expect(registry.errors).toHaveLength(3);
  });

  it('keeps the last good config when the file becomes invalid JSON', () => {
    const { registry, file } = registryFor({ clis: [{ id: 'a', name: 'A', command: 'a' }] });
    fs.writeFileSync(file, '{ broken');
    registry.reload();
    expect(registry.get('a')).toBeDefined();
    expect(registry.errors[0]).toMatch(/clis\.json/);
  });

  it('reloads automatically when the file changes', async () => {
    const { registry, file } = registryFor({ clis: [{ id: 'a', name: 'A', command: 'a' }] });
    registry.watch();
    fs.writeFileSync(file, JSON.stringify({ clis: [{ id: 'b', name: 'B', command: 'b' }] }));
    await waitFor(() => registry.get('b') !== undefined, 5000);
    expect(registry.get('a')).toBeUndefined();
    registry.close();
  });

  it('does not expose waiting patterns through list()', () => {
    const { registry } = registryFor({
      clis: [{ id: 'a', name: 'A', command: 'a', waitingPatterns: ['x'] }],
    });
    expect(registry.list()[0]).not.toHaveProperty('waitingPatterns');
  });
});

describe('cliLaunchArgs', () => {
  it('quotes command and args for PowerShell', () => {
    const args = cliLaunchArgs(
      { file: 'powershell.exe', args: ['-NoLogo'] },
      {
        id: 'x',
        name: 'X',
        command: "C:\\Program Files\\it's\\x.exe",
        args: ['--flag', 'a b'],
        color: '#000000',
        statusMode: 'heuristic',
        waitingPatterns: [],
        enabled: true,
      },
    );
    expect(args).toEqual([
      '-NoLogo',
      '-Command',
      "& 'C:\\Program Files\\it''s\\x.exe' '--flag' 'a b'; exit $LASTEXITCODE",
    ]);
  });
});

describe('CLI sessions over the API', () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;
  beforeAll(async () => {
    server = await startTestServer(43102);
  });
  afterAll(() => server.app.close());

  const create = (body: unknown) =>
    server.api('/api/sessions', { method: 'POST', body: JSON.stringify(body) });

  it('lists CLIs from the config file', async () => {
    const body = (await (await server.api('/api/clis')).json()) as { clis: CliInfo[] };
    expect(body.clis.map((c) => c.id)).toEqual(['fake', 'off', 'fake-hooks']);
  });

  it('launches the configured command for a cliId', async () => {
    const res = await create({ cliId: 'fake', cwd: process.cwd() });
    expect(res.status).toBe(201);
    const session = (await res.json()) as SessionInfo;
    expect(session).toMatchObject({ cliId: 'fake', title: 'Fake CLI' });

    const client = await server.connect(session.id);
    await waitFor(() => client.output().includes('fake-cli ready'));
    client.send({ type: 'input', data: 'hello\r' });
    await waitFor(() => client.output().includes('echo:hello'));
    client.ws.close();
  });

  it('rejects unknown and disabled CLIs', async () => {
    expect((await create({ cliId: 'nope' })).status).toBe(400);
    expect((await create({ cliId: 'off' })).status).toBe(400);
  });

  it('ignores a command smuggled into the request body', async () => {
    const res = await create({ cliId: 'fake', command: 'calc.exe', cwd: process.cwd() });
    const session = (await res.json()) as SessionInfo;
    const client = await server.connect(session.id);
    await waitFor(() => client.output().includes('fake-cli ready'));
    client.ws.close();
  });
});
