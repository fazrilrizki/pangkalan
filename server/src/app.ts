import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import type { ServerConfig } from './config';
import { sessionRoutes } from './routes/sessions';
import { registerSecurity } from './security/auth';
import { SessionManager } from './sessions/session-manager';

export interface AppOptions {
  config: ServerConfig;
  token: string;
  logger?: boolean;
  sessions?: SessionManager;
}

export async function buildApp({
  config,
  token,
  logger = false,
  sessions = new SessionManager(),
}: AppOptions) {
  const app = Fastify({ logger });

  registerSecurity(app, { token, allowedOrigins: config.allowedOrigins });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(sessionRoutes, { sessions, shell: config.shell });

  app.addHook('onClose', async () => sessions.killAll());

  return app;
}
