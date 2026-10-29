import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Project, SessionInfo } from '@integrasi/shared';
import { ProjectStore } from '../src/projects/project-store';
import { makeDataDir, startTestServer, waitFor } from './helpers';

function tempFolder(name: string) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'integrasi-proj-')), name);
  fs.mkdirSync(dir);
  return dir;
}

describe('ProjectStore', () => {
  it('persists projects across instances', () => {
    const file = path.join(makeDataDir(), 'projects.json');
    const folder = tempFolder('alpha');
    const created = new ProjectStore(file).create({ path: folder });
    expect(created).toMatchObject({ name: 'alpha', path: folder, favorite: false });

    const reopened = new ProjectStore(file);
    expect(reopened.list()).toEqual([created]);
    expect(fs.readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('reads projects saved before previewUrl existed', () => {
    const file = path.join(makeDataDir(), 'projects.json');
    const old = { id: 'p1', name: 'old', path: 'C:\\old', favorite: false, createdAt: 'x' };
    fs.writeFileSync(file, JSON.stringify({ projects: [old] }));
    expect(new ProjectStore(file).get('p1')?.previewUrl).toBeNull();
  });

  it('starts empty when the file is missing or corrupt', () => {
    const file = path.join(makeDataDir(), 'projects.json');
    expect(new ProjectStore(file).list()).toEqual([]);
    fs.writeFileSync(file, '{ nope');
    expect(new ProjectStore(file).list()).toEqual([]);
  });
});

describe('projects API', () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;
  beforeAll(async () => {
    server = await startTestServer(43103);
  });
  afterAll(() => server.app.close());

  const json = (method: string, url: string, body?: unknown) =>
    server.api(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  it('creates, renames, favorites and deletes a project without touching the folder', async () => {
    const folder = tempFolder('beta');
    const created = await json('POST', '/api/projects', { path: folder, name: 'Beta App' });
    expect(created.status).toBe(201);
    const project = (await created.json()) as Project;

    const renamed = await json('PATCH', `/api/projects/${project.id}`, { name: 'Beta 2' });
    expect(((await renamed.json()) as Project).name).toBe('Beta 2');

    const starred = await json('PATCH', `/api/projects/${project.id}`, { favorite: true });
    expect(((await starred.json()) as Project).favorite).toBe(true);

    expect((await json('DELETE', `/api/projects/${project.id}`)).status).toBe(204);
    expect(fs.existsSync(folder)).toBe(true);
    const list = (await (await json('GET', '/api/projects')).json()) as Project[];
    expect(list.find((p) => p.id === project.id)).toBeUndefined();
  });

  it('sets, validates and clears a manual preview URL', async () => {
    const folder = tempFolder('preview');
    const project = (await (
      await json('POST', '/api/projects', { path: folder })
    ).json()) as Project;
    expect(project.previewUrl).toBeNull();

    const url = 'http://localhost:5173/app';
    const set = await json('PATCH', `/api/projects/${project.id}`, { previewUrl: url });
    expect(((await set.json()) as Project).previewUrl).toBe(url);

    for (const bad of ['javascript:alert(1)', 'file:///C:/x', 'not a url']) {
      expect((await json('PATCH', `/api/projects/${project.id}`, { previewUrl: bad })).status).toBe(
        400,
      );
    }

    const cleared = await json('PATCH', `/api/projects/${project.id}`, { previewUrl: null });
    expect(((await cleared.json()) as Project).previewUrl).toBeNull();
  });

  it('rejects a missing folder, a duplicate folder, and an empty patch', async () => {
    const missing = await json('POST', '/api/projects', { path: 'Z:\\nope\\nope' });
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toMatch(/tidak ditemukan/);

    const folder = tempFolder('gamma');
    const first = (await (await json('POST', '/api/projects', { path: folder })).json()) as Project;
    expect((await json('POST', '/api/projects', { path: folder.toUpperCase() })).status).toBe(409);
    expect((await json('PATCH', `/api/projects/${first.id}`, {})).status).toBe(400);
    expect((await json('PATCH', '/api/projects/unknown', { name: 'x' })).status).toBe(404);
  });

  it('opens a CLI session in the project folder', async () => {
    const folder = tempFolder('delta');
    const project = (await (
      await json('POST', '/api/projects', { path: folder })
    ).json()) as Project;
    const res = await json('POST', '/api/sessions', { projectId: project.id });
    expect(res.status).toBe(201);
    const session = (await res.json()) as SessionInfo;
    expect(session).toMatchObject({ projectId: project.id, cwd: folder });

    const client = await server.connect(session.id);
    client.send({ type: 'input', data: '(Get-Location).Path\r' });
    await waitFor(() => client.output().includes(folder));
    client.ws.close();
  });

  it('rejects a session for an unknown project', async () => {
    expect((await json('POST', '/api/sessions', { projectId: 'nope' })).status).toBe(400);
  });
});
