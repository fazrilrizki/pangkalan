import Fastify from 'fastify';
import type { ServerConfig } from './config';
import { registerSecurity } from './security/auth';

export interface AppOptions {
  config: ServerConfig;
  token: string;
  logger?: boolean;
}

export async function buildApp({ config, token, logger = false }: AppOptions) {
  const app = Fastify({ logger });

  registerSecurity(app, { token, allowedOrigins: config.allowedOrigins });

  app.get('/api/health', async () => ({ ok: true }));

  return app;
}
