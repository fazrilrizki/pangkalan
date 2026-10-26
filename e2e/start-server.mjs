// Starts the production server against a throwaway data dir with a fake CLI, for Playwright.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.E2E_DATA_DIR ?? path.join(os.tmpdir(), 'integrasi-e2e-data');
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
const fakeCli = path.join(root, 'server', 'test', 'fixtures', 'fake-cli.mjs');

fs.writeFileSync(
  path.join(dataDir, 'clis.json'),
  JSON.stringify({
    shell: { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] },
    clis: [
      {
        id: 'fake',
        name: 'Fake CLI',
        command: process.execPath,
        args: [fakeCli],
        color: '#D97757',
        waitingPatterns: ['\\(y/n\\)\\s*$'],
      },
    ],
  }),
);

const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const child = spawn(process.execPath, [tsx, path.join(root, 'server', 'src', 'index.ts')], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.E2E_PORT,
    INTEGRASI_TOKEN: process.env.E2E_TOKEN,
    INTEGRASI_DATA_DIR: dataDir,
  },
});

const stop = () => {
  child.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
