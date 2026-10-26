import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

export const TEST_TOKEN = 'a'.repeat(64);
export const APP_ORIGIN = 'http://127.0.0.1:4317';
export const authHeaders = { host: '127.0.0.1:4317', authorization: `Bearer ${TEST_TOKEN}` };

export async function buildTestApp(env: NodeJS.ProcessEnv = {}) {
  const config = loadConfig({ NODE_ENV: 'test', ...env });
  return buildApp({ config, token: TEST_TOKEN });
}
