import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '@integrasi/shared';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface ServerConfig {
  host: '127.0.0.1';
  port: number;
  dataDir: string;
  webDistDir: string;
  /** Extra origins allowed besides the app's own (e.g. the Vite dev server). */
  devOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? DEFAULT_PORT);
  const isProduction = env.NODE_ENV === 'production';
  return {
    host: '127.0.0.1',
    port,
    dataDir: path.resolve(env.INTEGRASI_DATA_DIR ?? path.join(repoRoot, 'data')),
    webDistDir: path.join(repoRoot, 'web', 'dist'),
    devOrigins: isProduction ? [] : ['http://127.0.0.1:5173', 'http://localhost:5173'],
  };
}
