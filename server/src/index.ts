import { buildApp } from './app';
import { loadConfig } from './config';
import { loadOrCreateToken } from './security/auth';

const config = loadConfig();
const token = loadOrCreateToken(config.dataDir);
const app = await buildApp({ config, token, logger: true });

await app.listen({ host: config.host, port: config.port });

const isProduction = process.env.NODE_ENV === 'production';
const openUrl = isProduction ? `http://127.0.0.1:${config.port}` : 'http://127.0.0.1:5173';
console.log(`\n  Pangkalan siap -> ${openUrl}/?token=${token}\n`);
const remote = app.access.remote;
if (remote) {
  console.log(`  Remote aktif untuk: ${remote.users.join(', ')}`);
  console.log(`  Buka dari HP -> ${remote.origin}/?token=${token}\n`);
}
