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
  /** Origins allowed to call the API: the app itself plus the Vite dev server outside production. */
  allowedOrigins: string[];
  /** Used when data/clis.json does not define a shell. Must be PowerShell (CLIs launch via -Command). */
  shell: ShellConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? DEFAULT_PORT);
  const isProduction = env.NODE_ENV === 'production';
  const appOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  const devOrigins = isProduction ? [] : ['http://127.0.0.1:5173', 'http://localhost:5173'];
  return {
    host: '127.0.0.1',
    port,
    dataDir: path.resolve(env.INTEGRASI_DATA_DIR ?? path.join(repoRoot, 'data')),
    webDistDir: path.join(repoRoot, 'web', 'dist'),
    cliExampleFile: path.join(repoRoot, 'data', 'clis.example.json'),
    allowedOrigins: [...appOrigins, ...devOrigins],
    shell: { file: 'powershell.exe', args: ['-NoLogo'] },
  };
}
