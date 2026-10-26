import fs from 'node:fs';
import path from 'node:path';
import type { CliConfig, CliInfo, ShellConfig } from '@integrasi/shared';
import { cliFileSchema, cliSchema, shellSchema } from '@integrasi/shared';

export interface CliRegistryOptions {
  file: string;
  /** Copied to `file` when it does not exist yet. */
  exampleFile: string;
  fallbackShell: ShellConfig;
  log?: (message: string) => void;
}

/** Reads the CLI list from a JSON file and reloads it whenever the file changes. */
export class CliRegistry {
  private clis = new Map<string, CliConfig>();
  private shellConfig: ShellConfig;
  private watcher: fs.FSWatcher | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  errors: string[] = [];

  constructor(private readonly options: CliRegistryOptions) {
    this.shellConfig = options.fallbackShell;
    if (!fs.existsSync(options.file)) {
      fs.mkdirSync(path.dirname(options.file), { recursive: true });
      fs.copyFileSync(options.exampleFile, options.file);
    }
    this.reload();
  }

  get shell(): ShellConfig {
    return this.shellConfig;
  }

  list(): CliInfo[] {
    return [...this.clis.values()].map(({ waitingPatterns: _, ...info }) => info);
  }

  get(id: string): CliConfig | undefined {
    return this.clis.get(id);
  }

  reload() {
    const log = this.options.log ?? (() => {});
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(this.options.file, 'utf8'));
    } catch (err) {
      // Keep the last good config while the file is mid-edit or broken.
      this.errors = [`${this.options.file}: ${(err as Error).message}`];
      log(this.errors[0]!);
      return;
    }

    const file = cliFileSchema.safeParse(raw);
    if (!file.success) {
      this.errors = [`${this.options.file}: expected { shell?, clis: [] }`];
      log(this.errors[0]!);
      return;
    }

    const errors: string[] = [];
    const clis = new Map<string, CliConfig>();
    file.data.clis.forEach((entry, index) => {
      const parsed = cliSchema.safeParse(entry);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
        errors.push(`clis[${index}] skipped: ${issues.join('; ')}`);
      } else if (clis.has(parsed.data.id)) {
        errors.push(`clis[${index}] skipped: duplicate id "${parsed.data.id}"`);
      } else {
        clis.set(parsed.data.id, parsed.data);
      }
    });

    const shell = shellSchema.safeParse(file.data.shell);
    this.shellConfig = shell.success ? shell.data : this.options.fallbackShell;
    this.clis = clis;
    this.errors = errors;
    errors.forEach(log);
  }

  watch() {
    this.watcher = fs.watch(this.options.file, () => {
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => this.reload(), 100);
    });
  }

  close() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.watcher?.close();
  }
}

const quotePowerShell = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Builds the shell invocation for a CLI. Running through the user's shell keeps their PATH,
 * aliases and profile; the session ends when the CLI exits.
 */
export function cliLaunchArgs(shell: ShellConfig, cli: CliConfig): string[] {
  const commandLine = ['&', quotePowerShell(cli.command), ...cli.args.map(quotePowerShell)].join(
    ' ',
  );
  // Without the explicit exit, PowerShell collapses any CLI failure to exit code 1.
  return [...shell.args, '-Command', `${commandLine}; exit $LASTEXITCODE`];
}
