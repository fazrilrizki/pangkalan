import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DirListing } from '@integrasi/shared';
import { startTestServer } from './helpers';

describe('folder picker API', () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;
  beforeAll(async () => {
    server = await startTestServer(43107);
  });
  afterAll(() => server.app.close());

  const list = async (dir?: string) => {
    const query = dir === undefined ? '' : `?path=${encodeURIComponent(dir)}`;
    return server.api(`/api/fs/dirs${query}`);
  };

  it('starts in the home folder', async () => {
    const listing = (await (await list()).json()) as DirListing;
    expect(listing.path).toBe(os.homedir());
    expect(listing.roots.length).toBeGreaterThan(0);
  });

  it('lists only visible subfolders, sorted, with the parent', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integrasi-fs-'));
    for (const name of ['beta', 'Alpha', '.git']) fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, 'file.txt'), 'x');

    const listing = (await (await list(dir)).json()) as DirListing;
    expect(listing.dirs).toEqual([
      { name: 'Alpha', path: path.join(dir, 'Alpha') },
      { name: 'beta', path: path.join(dir, 'beta') },
    ]);
    expect(listing.parent).toBe(path.dirname(dir));
  });

  it('has no parent at a filesystem root', async () => {
    const root = path.parse(os.homedir()).root;
    expect(((await (await list(root)).json()) as DirListing).parent).toBeNull();
  });

  it('rejects a missing folder', async () => {
    const res = await list(path.join(os.tmpdir(), 'integrasi-nope-nope'));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/tidak ditemukan/);
  });

  it('requires the token', async () => {
    const res = await fetch(`${server.origin}/api/fs/dirs`);
    expect(res.status).toBe(401);
  });
});
