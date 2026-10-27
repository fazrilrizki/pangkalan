import { z } from 'zod';
import type { SessionInfo } from './protocol';

export const ARENA_MIN_ENTRIES = 2;
export const ARENA_MAX_ENTRIES = 4;

/** One contestant: a CLI from clis.json, optionally with extra args such as `--model opus`. */
export interface ArenaEntry {
  /** A, B, C or D. */
  letter: string;
  cliId: string;
  extraArgs: string[];
  branch: string;
  worktree: string;
  /** Null once the session has ended or the server restarted. */
  sessionId: string | null;
  /** The prompt is typed in once the CLI first goes quiet; `pending` until then. */
  prompt: 'pending' | 'sent';
}

/**
 * What sets a contestant apart from others on the same CLI, for labels: the `--model` value when
 * there is one (`haiku`), otherwise the extra args themselves.
 */
export function contestantVariant(extraArgs: string[]): string | null {
  const flag = extraArgs.findIndex((a) => a === '--model' || a === '-m');
  if (flag !== -1 && extraArgs[flag + 1]) return extraArgs[flag + 1]!;
  const inline = extraArgs.find((a) => a.startsWith('--model='));
  if (inline) return inline.slice('--model='.length);
  return extraArgs.length > 0 ? extraArgs.join(' ') : null;
}

export interface Arena {
  id: string;
  projectId: string;
  prompt: string;
  baseBranch: string;
  baseCommit: string;
  status: 'running' | 'merged' | 'discarded';
  winner: string | null;
  createdAt: string;
  entries: ArenaEntry[];
}

export const createArenaSchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().trim().min(1).max(20_000),
  entries: z
    .array(
      z.object({
        cliId: z.string().min(1),
        extraArgs: z.array(z.string().min(1).max(200)).max(20).default([]),
      }),
    )
    .min(ARENA_MIN_ENTRIES)
    .max(ARENA_MAX_ENTRIES),
  cols: z.number().int().min(2).max(1000).optional(),
  rows: z.number().int().min(2).max(500).optional(),
});
export type CreateArenaInput = z.infer<typeof createArenaSchema>;

export interface ArenaCreated {
  arena: Arena;
  sessions: SessionInfo[];
}

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
  binary: boolean;
}

export interface ArenaEntryDiff {
  letter: string;
  files: DiffFile[];
  patch: string;
  /** The patch was cut to keep the response small. */
  truncated: boolean;
}

/** What the base folder looks like before starting, so the form can warn. */
export interface ProjectGitInfo {
  isRepo: boolean;
  branch: string | null;
  /** Uncommitted changes are not copied into the contestants' worktrees. */
  dirty: boolean;
}
