import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CreateProjectInput, Project, UpdateProjectInput } from '@integrasi/shared';

export class ProjectError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

const samePath = (a: string, b: string) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** Project list persisted as JSON. Only stores paths; never touches the folders themselves. */
export class ProjectStore {
  private projects: Project[];

  constructor(private readonly file: string) {
    this.projects = this.read();
  }

  list(): Project[] {
    return [...this.projects];
  }

  get(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id);
  }

  create({ path: rawPath, name }: CreateProjectInput): Project {
    const resolved = path.resolve(rawPath);
    if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
      throw new ProjectError(400, `Folder tidak ditemukan: ${resolved}`);
    }
    if (this.projects.some((p) => samePath(p.path, resolved))) {
      throw new ProjectError(409, 'Project dengan folder ini sudah ada');
    }
    const project: Project = {
      id: randomUUID(),
      name: name ?? (path.basename(resolved) || resolved),
      path: resolved,
      favorite: false,
      createdAt: new Date().toISOString(),
    };
    this.projects.push(project);
    this.write();
    return project;
  }

  update(id: string, changes: UpdateProjectInput): Project {
    const project = this.get(id);
    if (!project) throw new ProjectError(404, 'Project tidak ditemukan');
    Object.assign(project, changes);
    this.write();
    return project;
  }

  remove(id: string) {
    const before = this.projects.length;
    this.projects = this.projects.filter((p) => p.id !== id);
    if (this.projects.length === before) throw new ProjectError(404, 'Project tidak ditemukan');
    this.write();
  }

  private read(): Project[] {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as { projects?: Project[] };
      return Array.isArray(data.projects) ? data.projects : [];
    } catch {
      return [];
    }
  }

  /** Write to a temp file then rename, so a crash mid-write never leaves a truncated file. */
  private write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ projects: this.projects }, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
