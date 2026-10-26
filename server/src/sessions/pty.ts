import * as nodePty from '@lydell/node-pty';

export interface PtyProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (exitCode: number) => void): void;
}

export interface SpawnPtyOptions {
  file: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: NodeJS.ProcessEnv;
}

/** Thin seam over the PTY package so it can be swapped without touching callers. */
function ignoreExited(action: () => void) {
  try {
    action();
  } catch {
    // process already gone
  }
}

export function spawnPty({
  file,
  args,
  cwd,
  cols,
  rows,
  env = process.env,
}: SpawnPtyOptions): PtyProcess {
  const proc = nodePty.spawn(file, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
  });

  return {
    get pid() {
      return proc.pid;
    },
    // The process can die before node-pty emits exit; writing or resizing in that window throws.
    // The exit event follows shortly, so these calls are safe to drop.
    write: (data) => ignoreExited(() => proc.write(data)),
    resize: (c, r) => ignoreExited(() => proc.resize(c, r)),
    kill: () => ignoreExited(() => proc.kill()),
    onData: (listener) => {
      proc.onData(listener);
    },
    onExit: (listener) => {
      proc.onExit(({ exitCode }) => listener(exitCode));
    },
  };
}
