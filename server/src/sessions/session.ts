import { spawnSync } from 'node:child_process';
import type { ServerMessage, SessionInfo, SessionStatus } from '@integrasi/shared';
import { extractLocalUrls } from './preview-url';
import type { PtyProcess } from './pty';
import { RingBuffer } from './ring-buffer';
import type { LiveStatus, StatusTrackerOptions } from './status-detector';
import { StatusTracker } from './status-detector';

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

export interface SessionOptions {
  scrollbackChars: number;
  status: StatusTrackerOptions;
  statusIntervalMs: number;
  /** Secret the CLI's hooks must present to report status (kept out of `info()`). */
  hookSecret?: string;
  /** Runs once when the process ends, e.g. to delete per-session temp files. */
  cleanup?: () => void;
  /** Ports never offered as a preview, e.g. Pangkalan's own hook endpoint. */
  ignorePreviewPorts?: readonly number[];
}

/** Output kept from the previous chunk so a URL split across chunks is still found. */
const URL_CARRY_CHARS = 200;
/** Output silence after which a URL at the end of the output counts as complete. */
const URL_QUIET_MS = 150;

/** A running PTY plus its scrollback. Lives independently of any connected client. */
export class Session {
  private readonly buffer: RingBuffer;
  private readonly listeners = new Set<SessionListener>();
  private readonly createdAt = new Date().toISOString();
  private readonly tracker: StatusTracker;
  private readonly statusTimer: ReturnType<typeof setInterval>;
  private status: SessionStatus = 'working';
  private exitCode: number | null = null;
  private killRequested = false;
  private previewUrl: string | null = null;
  private previewDetectedAt: string | null = null;
  private urlCarry = '';
  private urlQuietTimer: ReturnType<typeof setTimeout> | undefined;
  readonly hookSecret: string | null;

  constructor(
    readonly meta: SessionMeta,
    private readonly pty: PtyProcess,
    options: SessionOptions,
  ) {
    this.buffer = new RingBuffer(options.scrollbackChars);
    this.hookSecret = options.hookSecret ?? null;
    this.tracker = new StatusTracker(options.status);
    this.statusTimer = setInterval(() => this.refreshStatus(), options.statusIntervalMs);
    this.statusTimer.unref();

    pty.onData((data) => {
      this.buffer.push(data);
      this.tracker.onOutput(data);
      this.broadcast({ type: 'output', data });
      this.detectPreviewUrl(data, options.ignorePreviewPorts ?? []);
    });
    pty.onExit((code) => {
      clearInterval(this.statusTimer);
      clearTimeout(this.urlQuietTimer);
      options.cleanup?.();
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
      previewUrl: this.previewUrl,
      previewDetectedAt: this.previewDetectedAt,
    };
  }

  /** Subscribes a client: it first receives the scrollback, then live messages. */
  attach(listener: SessionListener): () => void {
    listener({ type: 'replay', data: this.buffer.toString() });
    listener({ type: 'status', status: this.status });
    if (this.previewUrl && this.previewDetectedAt) {
      listener({ type: 'preview', url: this.previewUrl, detectedAt: this.previewDetectedAt });
    }
    if (this.exitCode !== null) listener({ type: 'exit', code: this.exitCode });
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  write(data: string) {
    if (!this.isRunning) return;
    this.tracker.onInput();
    this.pty.write(data);
  }

  resize(cols: number, rows: number) {
    if (this.isRunning) this.pty.resize(cols, rows);
  }

  /** What is on screen since the user last typed, without escape codes. */
  textSinceInput(): string {
    return this.tracker.textSinceInput();
  }

  /** Status reported by the CLI itself (e.g. Claude Code hooks). */
  reportStatus(status: LiveStatus) {
    if (!this.isRunning) return;
    this.tracker.onHook(status);
    this.refreshStatus();
  }

  kill() {
    if (!this.isRunning) return;
    this.killRequested = true;
    killProcessTree(this.pty.pid);
    this.pty.kill();
  }

  dispose() {
    clearInterval(this.statusTimer);
    clearTimeout(this.urlQuietTimer);
    this.kill();
  }

  /**
   * A URL at the very end of a chunk may be cut off, so it waits until more output follows
   * it or the output goes quiet (ConPTY often sends nothing after the last line printed).
   */
  private detectPreviewUrl(data: string, ignorePorts: readonly number[]) {
    const text = this.urlCarry + data;
    this.urlCarry = text.slice(-URL_CARRY_CHARS);
    this.usePreviewUrl(extractLocalUrls(text, { ignorePorts, streaming: true }).at(-1));
    clearTimeout(this.urlQuietTimer);
    this.urlQuietTimer = setTimeout(
      () => this.usePreviewUrl(extractLocalUrls(this.urlCarry, { ignorePorts }).at(-1)),
      URL_QUIET_MS,
    );
    this.urlQuietTimer.unref();
  }

  private usePreviewUrl(url: string | undefined) {
    if (!url || url === this.previewUrl) return;
    this.previewUrl = url;
    this.previewDetectedAt = new Date().toISOString();
    this.broadcast({ type: 'preview', url, detectedAt: this.previewDetectedAt });
  }

  private refreshStatus() {
    if (this.isRunning) this.setStatus(this.tracker.current());
  }

  private setStatus(status: SessionStatus) {
    if (status === this.status) return;
    this.status = status;
    this.broadcast({ type: 'status', status });
  }

  private broadcast(message: ServerMessage) {
    for (const listener of this.listeners) listener(message);
  }
}
