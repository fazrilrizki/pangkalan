import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { CliRegistry } from './clis/cli-registry';
import type { ServerConfig } from './config';
import { ProjectStore } from './projects/project-store';
import { cliRoutes } from './routes/clis';
import { hookRoutes } from './routes/hooks';
import { projectRoutes } from './routes/projects';
import { sessionRoutes } from './routes/sessions';
import { registerSecurity } from './security/auth';
import { SessionManager } from './sessions/session-manager';

export interface AppOptions {
  config: ServerConfig;
  token: string;
  logger?: boolean;
  sessions?: SessionManager;
  clis?: CliRegistry;
}

export async function buildApp({
  config,
  token,
  logger = false,
  sessions = new SessionManager(),
  clis,
}: AppOptions) {
  const app = Fastify({ logger });

  const registry =
    clis ??
    new CliRegistry({
      file: path.join(config.dataDir, 'clis.json'),
      exampleFile: config.cliExampleFile,
      fallbackShell: config.shell,
      log: (message) => app.log.warn(message),
    });
  if (!clis) registry.watch();

  registerSecurity(app, { token, allowedOrigins: config.allowedOrigins });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  const projects = new ProjectStore(path.join(config.dataDir, 'projects.json'));

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(cliRoutes, { clis: registry });
  await app.register(projectRoutes, { projects });
  await app.register(sessionRoutes, { sessions, clis: registry, projects, port: config.port });
  await app.register(hookRoutes, { sessions });

  // `npm start` serves the built web app; in dev Vite serves it and proxies /api and /ws.
  if (fs.existsSync(path.join(config.webDistDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDistDir });
  }

  app.addHook('onClose', async () => {
    sessions.killAll();
    if (!clis) registry.close();
  });

  return app;
}
