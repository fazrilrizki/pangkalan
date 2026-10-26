import { randomUUID } from 'node:crypto';
import type { SessionInfo } from '@integrasi/shared';
import { spawnPty } from './pty';
import type { SessionMeta } from './session';
import { Session } from './session';

export const DEFAULT_SCROLLBACK_CHARS = 1024 * 1024;

export interface CreateSessionOptions extends Omit<SessionMeta, 'id'> {
  file: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly scrollbackChars = DEFAULT_SCROLLBACK_CHARS) {}

  create({ file, args, env, cols = 120, rows = 30, ...meta }: CreateSessionOptions): Session {
    const id = randomUUID();
    const pty = spawnPty({ file, args, cwd: meta.cwd, cols, rows, env });
    const session = new Session({ id, ...meta }, pty, this.scrollbackChars);
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => s.info());
  }

  /** Kills the process (if running) and forgets the session. */
  remove(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.kill();
    this.sessions.delete(id);
    return true;
  }

  killAll() {
    for (const id of [...this.sessions.keys()]) this.remove(id);
  }
}
