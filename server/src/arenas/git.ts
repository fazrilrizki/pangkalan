import { execFile } from 'node:child_process';

export class GitError extends Error {}

/** Runs git and resolves with trimmed-right stdout; rejects with git's own message. */
export function git(
  cwd: string,
  args: string[],
  maxBuffer = 16 * 1024 * 1024,
  env?: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer, env, windowsHide: true, timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err) reject(new GitError(stderr.trim() || err.message));
        else resolve(stdout.trimEnd());
      },
    );
  });
}

/** Commits everything in a worktree, if there is anything. Returns whether a commit was made. */
export async function commitAll(cwd: string, message: string): Promise<boolean> {
  await git(cwd, ['add', '-A']);
  if ((await git(cwd, ['diff', '--cached', '--name-only'])) === '') return false;
  try {
    await git(cwd, ['commit', '--no-verify', '-m', message]);
  } catch (err) {
    // No identity configured: commit anyway so the contestant's work is not lost.
    if (!/tell me who you are|user\.email|user\.name/i.test((err as Error).message)) throw err;
    await git(cwd, [
      '-c',
      'user.name=Pangkalan',
      '-c',
      'user.email=pangkalan@localhost',
      'commit',
      '--no-verify',
      '-m',
      message,
    ]);
  }
  return true;
}
