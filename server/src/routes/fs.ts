import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { DirEntry, DirListing } from '@integrasi/shared';

// Windows system folders nobody opens a project in; they also tend to deny access.
const HIDDEN = new Set(['$recycle.bin', 'system volume information']);
const isHidden = (name: string) => name.startsWith('.') || HIDDEN.has(name.toLowerCase());

function roots(): DirEntry[] {
  if (process.platform !== 'win32') return [{ name: '/', path: '/' }];
  return [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
    .map((letter) => `${letter}:\\`)
    .filter((drive) => fs.existsSync(drive))
    .map((drive) => ({ name: drive.slice(0, 2), path: drive }));
}

export function listDir(rawPath: string | undefined): DirListing {
  const dir = path.resolve(rawPath || os.homedir());
  const dirs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isHidden(entry.name))
    .map((entry) => ({ name: entry.name, path: path.join(dir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const parent = path.dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, dirs, roots: roots() };
}

export async function fsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { path?: string } }>('/api/fs/dirs', async (request, reply) => {
    try {
      return listDir(request.query.path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const message =
        code === 'ENOENT' || code === 'ENOTDIR'
          ? 'Folder tidak ditemukan'
          : code === 'EPERM' || code === 'EACCES'
            ? 'Tidak punya akses ke folder ini'
            : 'Folder tidak bisa dibuka';
      return reply.code(400).send({ error: message });
    }
  });
}
