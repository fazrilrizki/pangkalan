import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

export const E2E_PORT = 4399;
export const E2E_TOKEN = 'e'.repeat(64);
/** Fixed so tests can edit the server's clis.json; wiped on every run. */
export const E2E_DATA_DIR = path.join(os.tmpdir(), 'integrasi-e2e-data');

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    // Uses the installed Chrome instead of downloading Playwright's browser build.
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run build -w web && node e2e/start-server.mjs',
    url: `http://127.0.0.1:${E2E_PORT}/`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { E2E_PORT: String(E2E_PORT), E2E_TOKEN, E2E_DATA_DIR },
  },
});
