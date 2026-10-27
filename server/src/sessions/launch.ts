import { randomUUID } from 'node:crypto';
import type { CliRegistry } from '../clis/cli-registry';
import { cliLaunchArgs } from '../clis/cli-registry';
import type { ClaudeHookSetup } from './claude-hooks';
import { prepareClaudeHooks } from './claude-hooks';
import type { Session } from './session';
import type { SessionManager } from './session-manager';

export class LaunchError extends Error {}

export interface LaunchContext {
  sessions: SessionManager;
  clis: CliRegistry;
  /** Port hooks call back on. */
  port: number;
}

export interface LaunchOptions {
  cwd: string;
  /** Null opens a plain shell. */
  cliId: string | null;
  projectId: string | null;
  /** Appended after the CLI's configured args, e.g. `--model opus` for one arena contestant. */
  extraArgs?: string[];
  title?: string;
  cols?: number;
  rows?: number;
}

/** Starts a shell or a configured CLI. The command always comes from clis.json, never the caller. */
export function launchSession(
  { sessions, clis, port }: LaunchContext,
  { cwd, cliId, projectId, extraArgs = [], title, cols, rows }: LaunchOptions,
): Session {
  const id = randomUUID();
  const shell = clis.shell;
  let args = shell.args;
  let hooks: ClaudeHookSetup | undefined;
  let defaultTitle = 'Shell';
  let waitingPatterns: RegExp[] = [];
  if (cliId !== null) {
    const cli = clis.get(cliId);
    if (!cli) throw new LaunchError(`unknown cli "${cliId}"`);
    if (!cli.enabled) throw new LaunchError(`cli "${cliId}" is disabled`);
    if (cli.statusMode === 'hooks') hooks = prepareClaudeHooks(id, port);
    // Extra args last: an arena's initial prompt is a trailing positional argument.
    args = cliLaunchArgs(shell, cli, [...(hooks?.args ?? []), ...extraArgs]);
    defaultTitle = cli.name;
    waitingPatterns = cli.waitingPatterns.map((p) => new RegExp(p));
  }

  return sessions.create({
    id,
    file: shell.file,
    args,
    cwd,
    cols,
    rows,
    projectId,
    cliId,
    title: title ?? defaultTitle,
    waitingPatterns,
    hookSecret: hooks?.secret,
    cleanup: hooks?.cleanup,
  });
}
