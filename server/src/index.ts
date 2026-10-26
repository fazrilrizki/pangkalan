import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = await buildApp({ config, logger: true });

await app.listen({ host: config.host, port: config.port });
