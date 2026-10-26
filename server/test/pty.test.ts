import { describe, expect, it } from 'vitest';
import { spawnPty } from '../src/sessions/pty';

function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('waitFor timed out'));
      }
    }, 50);
  });
}

describe('spawnPty', () => {
  it('runs powershell, echoes input, resizes, and reports exit on kill', async () => {
    const proc = spawnPty({
      file: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile'],
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
    });
    let output = '';
    let exitCode: number | undefined;
    proc.onData((d) => (output += d));
    proc.onExit((code) => (exitCode = code));

    proc.write('echo pty-hello\r');
    await waitFor(() => output.includes('pty-hello'));

    expect(() => proc.resize(120, 40)).not.toThrow();

    proc.kill();
    await waitFor(() => exitCode !== undefined);
    expect(typeof exitCode).toBe('number');
  });

  it('ignores writes and resizes after the process has exited', async () => {
    const proc = spawnPty({
      file: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-Command', 'exit 0'],
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
    });
    let exited = false;
    proc.onExit(() => (exited = true));
    await waitFor(() => exited);
    expect(() => proc.resize(100, 30)).not.toThrow();
    expect(() => proc.write('late')).not.toThrow();
    expect(() => proc.kill()).not.toThrow();
  });
});
