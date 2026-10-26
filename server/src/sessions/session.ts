import { spawnSync } from 'node:child_process';
import type { ServerMessage, SessionInfo, SessionStatus } from '@integrasi/shared';
import type { PtyProcess } from './pty';
import { RingBuffer } from './ring-buffer';

export type SessionListener = (message: ServerMessage) => void;

/**
 * Closing the PTY only ends the shell; a CLI started from it (and its own children) can be
 * left running. taskkill /T takes the whole tree down on Windows.
 */
function killProcessTree(pid: number) {
  if (process.platform !== 'win32') return;
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}

export interface SessionMeta {
  id: string;
  projectId: string | null;
  cliId: string | null;
  title: string;
  cwd: string;
}

/** A running PTY plus its scrollback. Lives independently of any connected client. */
export class Session {
  private readonly buffer: RingBuffer;
  private readonly listeners = new Set<SessionListener>();
  private readonly createdAt = new Date().toISOString();
  private status: SessionStatus = 'working';
  private exitCode: number | null = null;
  private killRequested = false;
  lastOutputAt = Date.now();

  constructor(
    readonly meta: SessionMeta,
    private readonly pty: PtyProcess,
    scrollbackChars: number,
  ) {
    this.buffer = new RingBuffer(scrollbackChars);
    pty.onData((data) => {
      this.lastOutputAt = Date.now();
      this.buffer.push(data);
      this.broadcast({ type: 'output', data });
    });
    pty.onExit((code) => {
      this.exitCode = code;
      this.setStatus(this.killRequested || code === 0 ? 'exited' : 'error');
      this.broadcast({ type: 'exit', code });
    });
  }

  get id() {
    return this.meta.id;
  }

  get pid() {
    return this.pty.pid;
  }

  get isRunning() {
    return this.exitCode === null;
  }

  info(): SessionInfo {
    return {
      ...this.meta,
      status: this.status,
      exitCode: this.exitCode,
      createdAt: this.createdAt,
    };
  }

  /** Subscribes a client: it first receives the scrollback, then live messages. */
  attach(listener: SessionListener): () => void {
    listener({ type: 'replay', data: this.buffer.toString() });
    listener({ type: 'status', status: this.status });
    if (this.exitCode !== null) listener({ type: 'exit', code: this.exitCode });
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  write(data: string) {
    if (this.isRunning) this.pty.write(data);
  }

  resize(cols: number, rows: number) {
    if (this.isRunning) this.pty.resize(cols, rows);
  }

  setStatus(status: SessionStatus) {
    if (status === this.status) return;
    this.status = status;
    this.broadcast({ type: 'status', status });
  }

  kill() {
    if (!this.isRunning) return;
    this.killRequested = true;
    killProcessTree(this.pty.pid);
    this.pty.kill();
  }

  private broadcast(message: ServerMessage) {
    for (const listener of this.listeners) listener(message);
  }
}
