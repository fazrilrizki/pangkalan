import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  Arena,
  ArenaCreated,
  ArenaEntry,
  ArenaEntryDiff,
  CreateArenaInput,
  DiffFile,
  ProjectGitInfo,
} from '@integrasi/shared';
import { contestantVariant } from '@integrasi/shared';
import type { ProjectStore } from '../projects/project-store';
import type { LaunchContext } from '../sessions/launch';
import { promptLaunchArgs } from '../clis/cli-registry';
import { LaunchError, launchSession } from '../sessions/launch';
import type { Session } from '../sessions/session';
import { commitAll, git } from './git';

export class ArenaError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

const LETTERS = ['A', 'B', 'C', 'D'];
const MAX_PATCH_CHARS = 300_000;

export interface ArenaManagerOptions {
  /** data/arenas.json */
  file: string;
  /** Contestants' worktrees live under here, outside the user's repo. */
  worktreeRoot: string;
  projects: ProjectStore;
  launch: LaunchContext;
  /** How long to wait for a CLI to settle before giving up on typing the prompt in. */
  promptTimeoutMs?: number;
}

/**
 * A CLI that opens with a choice menu (Claude's "trust this folder?", whose default is "No, exit")
 * must not receive the prompt: the Enter after it would pick the highlighted option. These match
 * menus even when the CLI's own waitingPatterns are out of date.
 */
const MENU_PATTERNS = [/Enter to confirm/i, /\(y\/n\)/i, /❯\s*\d+\.\s/];

const PROMPT_POLL_MS = 300;

export const looksLikeMenu = (text: string) => MENU_PATTERNS.some((p) => p.test(text));

const firstLine = (text: string) => text.split(/\r?\n/, 1)[0]!.slice(0, 72);

/**
 * Runs one prompt against several CLIs, each in its own git worktree and branch cut from the
 * project's HEAD, then merges the chosen one back. Worktrees outlive server restarts; sessions
 * do not, so an entry's session can be reopened in its worktree.
 */
export class ArenaManager {
  private arenas: Arena[];
  private readonly promptWatchers = new Map<string, () => void>();

  constructor(private readonly options: ArenaManagerOptions) {
    this.arenas = this.read();
  }

  list(): Arena[] {
    return this.arenas.map((arena) => this.view(arena));
  }

  async projectGit(projectId: string): Promise<ProjectGitInfo> {
    const project = this.project(projectId);
    try {
      const top = await git(project.path, ['rev-parse', '--show-toplevel']);
      const branch = await git(top, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const dirty = (await git(top, ['status', '--porcelain', '--untracked-files=no'])) !== '';
      return { isRepo: true, branch: branch === 'HEAD' ? null : branch, dirty };
    } catch {
      return { isRepo: false, branch: null, dirty: false };
    }
  }

  async create(input: CreateArenaInput): Promise<ArenaCreated> {
    const project = this.project(input.projectId);
    const top = await this.repoTop(project.path);
    const baseBranch = await git(top, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (baseBranch === 'HEAD') {
      throw new ArenaError(409, 'Repo sedang detached HEAD. Checkout sebuah branch dulu.');
    }
    const baseCommit = await git(top, ['rev-parse', 'HEAD']).catch(() => {
      throw new ArenaError(409, 'Repo belum punya commit.');
    });
    for (const entry of input.entries) {
      const cli = this.options.launch.clis.get(entry.cliId);
      if (!cli?.enabled) throw new ArenaError(400, `CLI "${entry.cliId}" tidak tersedia`);
    }

    const id = randomUUID();
    const short = id.slice(0, 8);
    const subdir = path.relative(top, path.resolve(project.path));
    const arena: Arena = {
      id,
      projectId: project.id,
      prompt: input.prompt,
      baseBranch,
      baseCommit,
      status: 'running',
      winner: null,
      createdAt: new Date().toISOString(),
      entries: [],
    };
    const started: Session[] = [];
    try {
      for (const [index, spec] of input.entries.entries()) {
        const letter = LETTERS[index]!;
        const branch = `adu/${short}-${letter.toLowerCase()}-${spec.cliId}`;
        const worktree = path.join(this.options.worktreeRoot, short, letter);
        await git(top, ['worktree', 'add', '-b', branch, worktree, baseCommit]);
        const entry: ArenaEntry = {
          letter,
          cliId: spec.cliId,
          extraArgs: spec.extraArgs,
          branch,
          worktree,
          sessionId: null,
          prompt: 'pending',
        };
        arena.entries.push(entry);
        // A CLI that takes the prompt as an argument handles its own start-up dialogs first.
        const cli = this.options.launch.clis.get(spec.cliId)!;
        const promptArgs = promptLaunchArgs(cli, input.prompt);
        if (promptArgs) entry.prompt = 'sent';
        const session = this.launch(arena, entry, subdir, input.cols, input.rows, promptArgs);
        started.push(session);
      }
    } catch (err) {
      for (const session of started) this.options.launch.sessions.remove(session.id);
      await this.removeWorktrees(top, arena, { deleteBranches: true });
      if (err instanceof LaunchError) throw new ArenaError(400, err.message);
      throw err;
    }

    this.arenas.push(arena);
    this.save();
    for (const [index, entry] of arena.entries.entries()) {
      if (entry.prompt === 'pending') this.watchForPrompt(arena, entry, started[index]!);
    }
    return { arena: this.view(arena), sessions: started.map((s) => s.info()) };
  }

  /** Each contestant's work against the base commit, including uncommitted and new files. */
  async diff(id: string): Promise<ArenaEntryDiff[]> {
    const arena = this.running(id);
    return Promise.all(
      arena.entries.map(async (entry) => {
        // A throwaway index, so the contestant's own staging area is left alone.
        const env = {
          ...process.env,
          GIT_INDEX_FILE: path.join(os.tmpdir(), `pangkalan-index-${randomUUID()}`),
        };
        try {
          await git(entry.worktree, ['add', '-A'], undefined, env);
          const numstat = await git(
            entry.worktree,
            ['diff', '--cached', '--numstat', arena.baseCommit],
            undefined,
            env,
          );
          const patch = await git(
            entry.worktree,
            ['diff', '--cached', arena.baseCommit],
            64 * 1024 * 1024,
            env,
          );
          return {
            letter: entry.letter,
            files: parseNumstat(numstat),
            patch: patch.slice(0, MAX_PATCH_CHARS),
            truncated: patch.length > MAX_PATCH_CHARS,
          };
        } finally {
          fs.rmSync(env.GIT_INDEX_FILE, { force: true });
        }
      }),
    );
  }

  /** Types the prompt in now, for a CLI that never went quiet on its own. */
  sendPrompt(id: string, letter: string) {
    const arena = this.running(id);
    const entry = this.entry(arena, letter);
    const session = entry.sessionId ? this.options.launch.sessions.get(entry.sessionId) : undefined;
    if (!session?.isRunning) throw new ArenaError(409, 'Sesi peserta ini tidak berjalan');
    this.deliverPrompt(arena, entry, session);
  }

  reopen(id: string, letter: string, cols?: number, rows?: number) {
    const arena = this.running(id);
    const entry = this.entry(arena, letter);
    const current = entry.sessionId ? this.options.launch.sessions.get(entry.sessionId) : undefined;
    if (current?.isRunning) throw new ArenaError(409, 'Sesi peserta ini masih berjalan');
    const project = this.project(arena.projectId);
    return this.repoTop(project.path).then((top) => {
      const session = this.launch(
        arena,
        entry,
        path.relative(top, path.resolve(project.path)),
        cols,
        rows,
      );
      this.save();
      return session.info();
    });
  }

  async pickWinner(id: string, letter: string): Promise<Arena> {
    const arena = this.running(id);
    const winner = this.entry(arena, letter);
    const top = await this.repoTop(this.project(arena.projectId).path);

    // Check everything that can stop the merge before touching any contestant.
    const branch = await git(top, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== arena.baseBranch) {
      throw new ArenaError(
        409,
        `Project sekarang di branch ${branch}. Pindah ke ${arena.baseBranch} dulu.`,
      );
    }
    if ((await git(top, ['status', '--porcelain', '--untracked-files=no'])) !== '') {
      throw new ArenaError(
        409,
        `Ada perubahan belum di-commit di ${arena.baseBranch}. Commit atau stash dulu.`,
      );
    }

    await this.stopAndCommit(arena);
    const cli = this.options.launch.clis.get(winner.cliId);
    try {
      await git(top, [
        'merge',
        '--no-ff',
        '-m',
        `Adu agen: pemenang ${winner.letter} (${cli?.name ?? winner.cliId})\n\n${firstLine(arena.prompt)}`,
        winner.branch,
      ]);
    } catch (err) {
      await git(top, ['merge', '--abort']).catch(() => {});
      throw new ArenaError(
        409,
        `Merge ${winner.branch} gagal dan dibatalkan; worktree tetap ada. ${(err as Error).message}`,
      );
    }
    await this.removeWorktrees(top, arena, { deleteBranches: false });
    arena.status = 'merged';
    arena.winner = winner.letter;
    this.save();
    return this.view(arena);
  }

  /** Ends the arena without merging. Each contestant's work stays on its branch. */
  async discard(id: string): Promise<Arena> {
    const arena = this.running(id);
    const top = await this.repoTop(this.project(arena.projectId).path);
    await this.stopAndCommit(arena);
    await this.removeWorktrees(top, arena, { deleteBranches: false });
    arena.status = 'discarded';
    this.save();
    return this.view(arena);
  }

  /** Forgets a finished arena. Its branches stay in the repo. */
  remove(id: string) {
    const arena = this.find(id);
    if (arena.status === 'running') throw new ArenaError(409, 'Selesaikan atau batalkan adu dulu');
    this.arenas = this.arenas.filter((a) => a !== arena);
    this.save();
  }

  close() {
    for (const stop of this.promptWatchers.values()) stop();
    this.promptWatchers.clear();
  }

  private launch(
    arena: Arena,
    entry: ArenaEntry,
    subdir: string,
    cols?: number,
    rows?: number,
    promptArgs: string[] | null = null,
  ) {
    const cli = this.options.launch.clis.get(entry.cliId);
    const session = launchSession(this.options.launch, {
      cwd: path.join(entry.worktree, subdir),
      cliId: entry.cliId,
      projectId: arena.projectId,
      extraArgs: [...entry.extraArgs, ...(promptArgs ?? [])],
      title: [entry.letter, cli?.name ?? entry.cliId, contestantVariant(entry.extraArgs)]
        .filter(Boolean)
        .join(' · '),
      cols,
      rows,
    });
    entry.sessionId = session.id;
    return session;
  }

  /**
   * Types the prompt once the CLI is idle with no menu on screen. Polled rather than driven by
   * status changes: the short reply to answering a menu can count as keystroke echo, so the
   * status may stay idle throughout and never announce that the menu is gone.
   */
  private watchForPrompt(arena: Arena, entry: ArenaEntry, session: Session) {
    const stop = () => {
      clearInterval(poll);
      clearTimeout(timeout);
      this.promptWatchers.delete(session.id);
    };
    const poll = setInterval(() => {
      if (!session.isRunning) return stop();
      if (session.info().status !== 'idle' || looksLikeMenu(session.textSinceInput())) return;
      stop();
      this.deliverPrompt(arena, entry, session);
    }, PROMPT_POLL_MS);
    const timeout = setTimeout(stop, this.options.promptTimeoutMs ?? 120_000);
    poll.unref?.();
    timeout.unref?.();
    this.promptWatchers.set(session.id, stop);
  }

  private deliverPrompt(arena: Arena, entry: ArenaEntry, session: Session) {
    this.promptWatchers.get(session.id)?.();
    // Bracketed paste keeps a multi-line prompt as one message instead of submitting each line.
    const text = arena.prompt.replaceAll('\x1b[201~', '').replace(/\r\n?/g, '\n');
    session.write(`\x1b[200~${text}\x1b[201~`);
    setTimeout(() => session.write('\r'), 150).unref?.();
    entry.prompt = 'sent';
    this.save();
  }

  private async stopAndCommit(arena: Arena) {
    for (const entry of arena.entries) {
      if (entry.sessionId) {
        this.promptWatchers.get(entry.sessionId)?.();
        this.options.launch.sessions.remove(entry.sessionId);
      }
      entry.sessionId = null;
    }
    for (const entry of arena.entries) {
      if (!fs.existsSync(entry.worktree)) continue;
      await commitAll(entry.worktree, `adu ${entry.letter}: ${firstLine(arena.prompt)}`);
    }
  }

  private async removeWorktrees(
    top: string,
    arena: Arena,
    { deleteBranches }: { deleteBranches: boolean },
  ) {
    for (const entry of arena.entries) {
      await git(top, ['worktree', 'remove', '--force', entry.worktree]).catch(() => {});
      if (deleteBranches) await git(top, ['branch', '-D', entry.branch]).catch(() => {});
    }
    await git(top, ['worktree', 'prune']).catch(() => {});
    // On Windows a just-killed CLI can hold files open for a moment, or longer when it left a
    // child process behind. A leftover folder is only clutter; it must not fail a merge or
    // discard that has already happened.
    const dir = path.join(this.options.worktreeRoot, arena.id.slice(0, 8));
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (err) {
      console.warn(`[arena] could not remove ${dir}: ${(err as Error).message}`);
    }
  }

  private async repoTop(projectPath: string): Promise<string> {
    try {
      return path.resolve(await git(projectPath, ['rev-parse', '--show-toplevel']));
    } catch {
      throw new ArenaError(400, 'Folder project bukan repo git');
    }
  }

  private project(id: string) {
    const project = this.options.projects.get(id);
    if (!project) throw new ArenaError(404, 'Project tidak ditemukan');
    return project;
  }

  private find(id: string): Arena {
    const arena = this.arenas.find((a) => a.id === id);
    if (!arena) throw new ArenaError(404, 'Adu tidak ditemukan');
    return arena;
  }

  private running(id: string): Arena {
    const arena = this.find(id);
    if (arena.status !== 'running') throw new ArenaError(409, 'Adu ini sudah selesai');
    return arena;
  }

  private entry(arena: Arena, letter: string): ArenaEntry {
    const entry = arena.entries.find((e) => e.letter === letter);
    if (!entry) throw new ArenaError(404, `Peserta ${letter} tidak ada`);
    return entry;
  }

  /** Session ids do not survive a restart; report them as gone rather than dangling. */
  private view(arena: Arena): Arena {
    return {
      ...arena,
      entries: arena.entries.map((entry) => ({
        ...entry,
        sessionId:
          entry.sessionId && this.options.launch.sessions.get(entry.sessionId)
            ? entry.sessionId
            : null,
      })),
    };
  }

  private read(): Arena[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.options.file, 'utf8')) as unknown;
      return Array.isArray(raw) ? (raw as Arena[]) : [];
    } catch {
      return [];
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.options.file), { recursive: true });
    fs.writeFileSync(this.options.file, JSON.stringify(this.arenas, null, 2));
  }
}

export function parseNumstat(numstat: string): DiffFile[] {
  return numstat
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [added, removed, ...rest] = line.split('\t');
      const binary = added === '-';
      return {
        path: rest.join('\t'),
        added: binary ? 0 : Number(added),
        removed: binary ? 0 : Number(removed),
        binary,
      };
    });
}
