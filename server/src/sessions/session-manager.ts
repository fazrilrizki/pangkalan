import { randomUUID } from 'node:crypto';
import type { SessionInfo } from '@integrasi/shared';
import { spawnPty } from './pty';
import type { SessionMeta } from './session';
import { Session } from './session';
import type { StatusTrackerOptions } from './status-detector';

export const DEFAULT_SCROLLBACK_CHARS = 1024 * 1024;

export interface SessionManagerOptions {
  scrollbackChars?: number;
  statusIntervalMs?: number;
  /** Tuning shared by every session's status tracker (patterns come per session). */
  status?: Omit<StatusTrackerOptions, 'waitingPatterns'>;
}

export interface CreateSessionOptions extends Omit<SessionMeta, 'id'> {
  file: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
  waitingPatterns?: RegExp[];
}

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly options: SessionManagerOptions = {}) {}

  create({
    file,
    args,
    env,
    cols = 120,
    rows = 30,
    waitingPatterns = [],
    ...meta
  }: CreateSessionOptions & { id?: string }): Session {
    const id = meta.id ?? randomUUID();
    const pty = spawnPty({ file, args, cwd: meta.cwd, cols, rows, env });
    const session = new Session({ ...meta, id }, pty, {
      scrollbackChars: this.options.scrollbackChars ?? DEFAULT_SCROLLBACK_CHARS,
      statusIntervalMs: this.options.statusIntervalMs ?? 250,
      status: { ...this.options.status, waitingPatterns },
    });
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
    session.dispose();
    this.sessions.delete(id);
    return true;
  }

  killAll() {
    for (const id of [...this.sessions.keys()]) this.remove(id);
  }
}
