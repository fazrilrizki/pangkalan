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
 * PowerShell's legacy native-argument passing wraps an argument containing spaces in quotes but
 * leaves the quotes inside it bare, so `say "hi" now` reaches the program as `say hi now`.
 * Escaping by the MSVC argv rules first makes it arrive intact.
 */
export function escapeNativeArg(value: string): string {
  const escaped = value.replace(/(\\*)"/g, (_, slashes: string) => `${slashes}${slashes}\\"`);
  // Backslashes right before the closing quote PowerShell adds would escape it.
  return /\s/.test(value) ? escaped.replace(/(\\+)$/, '$1$1') : escaped;
}

/**
 * Builds the shell invocation for a CLI. Running through the user's shell keeps their PATH,
 * aliases and profile; the session ends when the CLI exits.
 */
export function cliLaunchArgs(
  shell: ShellConfig,
  cli: CliConfig,
  extraArgs: string[] = [],
): string[] {
  const commandLine = [
    '&',
    quotePowerShell(cli.command),
    ...[...cli.args, ...extraArgs].map((arg) => quotePowerShell(escapeNativeArg(arg))),
  ].join(' ');
  // Legacy passing is what escapeNativeArg is written for; pwsh 7.3+ defaults to another mode.
  // Without the explicit exit, PowerShell collapses any CLI failure to exit code 1.
  return [
    ...shell.args,
    '-Command',
    `$PSNativeCommandArgumentPassing = 'Legacy'; ${commandLine}; exit $LASTEXITCODE`,
  ];
}

/** The CLI's args that carry an initial prompt, or null if it only takes one typed in. */
export function promptLaunchArgs(cli: CliConfig, prompt: string): string[] | null {
  if (!cli.promptArgs) return null;
  return cli.promptArgs.map((arg) => arg.replaceAll('{prompt}', prompt));
}
