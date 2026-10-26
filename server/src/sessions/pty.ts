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
    pid: proc.pid,
    write: (data) => proc.write(data),
    resize: (c, r) => proc.resize(c, r),
    kill: () => proc.kill(),
    onData: (listener) => {
      proc.onData(listener);
    },
    onExit: (listener) => {
      proc.onExit(({ exitCode }) => listener(exitCode));
    },
  };
}
