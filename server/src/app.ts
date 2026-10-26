import Fastify from 'fastify';
import type { ServerConfig } from './config';

export interface AppOptions {
  config: ServerConfig;
  logger?: boolean;
}

export async function buildApp({ config, logger = false }: AppOptions) {
  const app = Fastify({ logger });

  app.get('/api/health', async () => ({ ok: true }));

  void config;
  return app;
}
