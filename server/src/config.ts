import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShellConfig } from '@integrasi/shared';
import { DEFAULT_PORT } from '@integrasi/shared';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface ServerConfig {
  host: '127.0.0.1';
  port: number;
  dataDir: string;
  webDistDir: string;
  cliExampleFile: string;
  /** Local origins allowed to call the API: the app itself plus the Vite dev server outside production.
   *  The remote origin is added at runtime while remote access is on. */
  allowedOrigins: string[];
  /** Used when data/clis.json does not define a shell. Must be PowerShell (CLIs launch via -Command). */
  shell: ShellConfig;
  /** Remote access set by env at start; null leaves it to the panel (off unless turned on there). */
  remote: RemoteConfig | null;
}

export interface RemoteConfig {
  /** e.g. https://laptop.tail1234.ts.net */
  origin: string;
  /** Tailscale logins (`Tailscale-User-Login`) allowed in, e.g. you@github. */
  users: string[];
}

/** Accepts only `https://<machine>.<tailnet>.ts.net`, the address `tailscale serve` gives. */
export function parseRemoteOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PANGKALAN_REMOTE_ORIGIN bukan URL: ${raw}`);
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.ts.net') || url.origin !== raw) {
    throw new Error(
      `PANGKALAN_REMOTE_ORIGIN harus berbentuk https://<mesin>.<tailnet>.ts.net, dapat: ${raw}`,
    );
  }
  return url.origin;
}

/** Both env vars must be set to turn remote access on; a malformed origin fails the start loudly. */
export function loadRemoteConfig(env: NodeJS.ProcessEnv): RemoteConfig | null {
  const rawOrigin = env.PANGKALAN_REMOTE_ORIGIN?.trim();
  const users = (env.PANGKALAN_REMOTE_USERS ?? '')
    .split(',')
    .map((user) => user.trim())
    .filter(Boolean);
  if (!rawOrigin && users.length === 0) return null;
  if (!rawOrigin || users.length === 0) {
    throw new Error('Remote butuh PANGKALAN_REMOTE_ORIGIN dan PANGKALAN_REMOTE_USERS sekaligus');
  }
  return { origin: parseRemoteOrigin(rawOrigin), users };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? DEFAULT_PORT);
  const isProduction = env.NODE_ENV === 'production';
  const appOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const devOrigins = isProduction ? [] : ['http://127.0.0.1:5173', 'http://localhost:5173'];
  const remote = loadRemoteConfig(env);
  return {
    host: '127.0.0.1',
    port,
    dataDir: path.resolve(env.INTEGRASI_DATA_DIR ?? path.join(repoRoot, 'data')),
    webDistDir: path.join(repoRoot, 'web', 'dist'),
    cliExampleFile: path.join(repoRoot, 'data', 'clis.example.json'),
    allowedOrigins: [...appOrigins, ...devOrigins],
    shell: { file: 'powershell.exe', args: ['-NoLogo'] },
    remote,
  };
}
