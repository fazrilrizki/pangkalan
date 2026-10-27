import { execFile } from 'node:child_process';
import fs from 'node:fs';
import type { TailscaleInfo } from '@integrasi/shared';

/** Runs the tailscale CLI with the given args and resolves with stdout. */
export type TailscaleRunner = (args: string[]) => Promise<string>;

export class TailscaleNotInstalled extends Error {}

/** The Windows installer does not always put tailscale on PATH. */
const WINDOWS_BINARY = 'C:\\Program Files\\Tailscale\\tailscale.exe';

function binary(): string {
  return process.platform === 'win32' && fs.existsSync(WINDOWS_BINARY)
    ? WINDOWS_BINARY
    : 'tailscale';
}

export const runTailscale: TailscaleRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile(binary(), args, { timeout: 15_000, windowsHide: true }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      if ((err as NodeJS.ErrnoException).code === 'ENOENT')
        return reject(new TailscaleNotInstalled());
      reject(new Error(stderr.trim() || err.message));
    });
  });

interface StatusJson {
  BackendState?: string;
  CertDomains?: string[] | null;
  Self?: { DNSName?: string; UserID?: number };
  User?: Record<string, { LoginName?: string }>;
}

interface ServeStatusJson {
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
}

const NOT_INSTALLED: TailscaleInfo = {
  installed: false,
  running: false,
  dnsName: null,
  login: null,
  httpsEnabled: false,
  serving: false,
};

export class Tailscale {
  constructor(
    private readonly port: number,
    private readonly run: TailscaleRunner = runTailscale,
  ) {}

  async info(): Promise<TailscaleInfo> {
    let status: StatusJson;
    try {
      status = JSON.parse(await this.run(['status', '--json'])) as StatusJson;
    } catch (err) {
      if (err instanceof TailscaleNotInstalled) return NOT_INSTALLED;
      // Installed but the daemon is down: `status` exits non-zero.
      return { ...NOT_INSTALLED, installed: true };
    }
    const dnsName = status.Self?.DNSName?.replace(/\.$/, '') || null;
    const userId = status.Self?.UserID;
    return {
      installed: true,
      running: status.BackendState === 'Running',
      dnsName,
      login: (userId !== undefined && status.User?.[String(userId)]?.LoginName) || null,
      httpsEnabled: (status.CertDomains?.length ?? 0) > 0,
      serving: await this.isServing(),
    };
  }

  /** Whether `tailscale serve` currently proxies to this server's port. */
  private async isServing(): Promise<boolean> {
    try {
      const status = JSON.parse(
        (await this.run(['serve', 'status', '--json'])) || '{}',
      ) as ServeStatusJson;
      const target = new RegExp(`^https?://(127\\.0\\.0\\.1|localhost):${this.port}/?$`);
      return Object.values(status.Web ?? {}).some((site) =>
        Object.values(site.Handlers ?? {}).some((handler) => target.test(handler.Proxy ?? '')),
      );
    } catch {
      return false;
    }
  }

  async serve(): Promise<void> {
    await this.run(['serve', '--bg', String(this.port)]);
  }

  async unserve(): Promise<void> {
    await this.run(['serve', '--https=443', 'off']);
  }
}
