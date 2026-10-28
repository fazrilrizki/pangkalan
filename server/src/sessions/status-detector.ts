import type { SessionStatus } from '@integrasi/shared';

export type LiveStatus = Exclude<SessionStatus, 'exited' | 'error'>;

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
// eslint-disable-next-line no-control-regex
const CURSOR_FORWARD = /\x1b\[(\d*)C/g;
// eslint-disable-next-line no-control-regex
const CURSOR_POSITION = /\x1b\[\d*(?:;\d*)?[Hf]/g;

/**
 * Plain text of terminal output. TUIs such as Claude Code draw the gaps between words with
 * cursor moves instead of spaces, so those become spaces and line jumps become newlines;
 * otherwise "Enter to confirm" would read as "Entertoconfirm".
 */
export function stripAnsi(text: string): string {
  return text
    .replace(CURSOR_FORWARD, (_, n: string) => ' '.repeat(Math.min(Number(n || 1), 200)))
    .replace(CURSOR_POSITION, '\n')
    .replace(ANSI, '');
}

export function detectStatus(input: {
  msSinceLastActivity: number;
  outputSinceInput: string;
  waitingPatterns: RegExp[];
  idleAfterMs: number;
}): LiveStatus {
  if (input.msSinceLastActivity < input.idleAfterMs) return 'working';
  const text = stripAnsi(input.outputSinceInput);
  return input.waitingPatterns.some((p) => p.test(text)) ? 'waiting' : 'idle';
}

export interface StatusTrackerOptions {
  waitingPatterns: RegExp[];
  idleAfterMs?: number;
  /** Output this soon after a keystroke, and this small, is treated as echo, not work. */
  echoWindowMs?: number;
  echoMaxChars?: number;
  /** A hook "working" signal is trusted only while output keeps flowing (Esc fires no hook). */
  hookWorkingSilenceMs?: number;
  now?: () => number;
}

const MAX_TAIL = 4096;

/**
 * Combines output heuristics with optional hook signals into one live status.
 * Hooks win while they are fresh; otherwise the heuristic decides.
 */
export class StatusTracker {
  private lastActivityAt: number;
  private lastInputAt = -Infinity;
  private outputSinceInput = '';
  private hook: { status: LiveStatus; at: number } | null = null;
  private readonly now: () => number;
  private readonly idleAfterMs: number;
  private readonly echoWindowMs: number;
  private readonly echoMaxChars: number;
  private readonly hookWorkingSilenceMs: number;

  constructor(private readonly options: StatusTrackerOptions) {
    this.now = options.now ?? Date.now;
    this.idleAfterMs = options.idleAfterMs ?? 1500;
    this.echoWindowMs = options.echoWindowMs ?? 150;
    this.echoMaxChars = options.echoMaxChars ?? 32;
    this.hookWorkingSilenceMs = options.hookWorkingSilenceMs ?? 5000;
    this.lastActivityAt = this.now();
  }

  onInput() {
    this.lastInputAt = this.now();
    this.outputSinceInput = '';
  }

  onOutput(data: string) {
    const now = this.now();
    this.outputSinceInput = (this.outputSinceInput + data).slice(-MAX_TAIL);
    const isEcho = now - this.lastInputAt < this.echoWindowMs && data.length <= this.echoMaxChars;
    if (!isEcho) this.lastActivityAt = now;
  }

  /** Plain text the program printed since the last keystroke (at most the last 4 KB). */
  textSinceInput(): string {
    return stripAnsi(this.outputSinceInput);
  }

  onHook(status: LiveStatus) {
    this.hook = { status, at: this.now() };
  }

  current(): LiveStatus {
    const now = this.now();
    const hook = this.hook;
    if (hook) {
      const silentFor = now - this.lastActivityAt;
      const stale =
        (hook.status === 'working' && silentFor > this.hookWorkingSilenceMs) ||
        (hook.status === 'waiting' && this.lastInputAt > hook.at);
      if (!stale) return hook.status;
    }
    return detectStatus({
      msSinceLastActivity: now - this.lastActivityAt,
      outputSinceInput: this.outputSinceInput,
      waitingPatterns: this.options.waitingPatterns,
      idleAfterMs: this.idleAfterMs,
    });
  }
}
