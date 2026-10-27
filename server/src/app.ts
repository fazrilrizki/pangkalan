import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { CliRegistry } from './clis/cli-registry';
import type { ServerConfig } from './config';
import { ProjectStore } from './projects/project-store';
import { AccessControl } from './remote/access-control';
import { Tailscale } from './remote/tailscale';
import { cliRoutes } from './routes/clis';
import { fsRoutes } from './routes/fs';
import { hookRoutes } from './routes/hooks';
import { projectRoutes } from './routes/projects';
import { remoteRoutes } from './routes/remote';
import { sessionRoutes } from './routes/sessions';
import { registerSecurity } from './security/auth';
import { SessionManager } from './sessions/session-manager';

declare module 'fastify' {
  interface FastifyInstance {
    /** Live token and remote-access state, changed from the remote panel. */
    access: AccessControl;
  }
}

export interface AppOptions {
  config: ServerConfig;
  token: string;
  logger?: boolean;
  sessions?: SessionManager;
  clis?: CliRegistry;
  /** Injected by tests so they never run the real tailscale CLI. */
  tailscale?: Tailscale;
}

export async function buildApp({
  config,
  token,
  logger = false,
  sessions = new SessionManager(),
  clis,
  tailscale = new Tailscale(config.port),
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

  const access = new AccessControl({
    token,
    dataDir: config.dataDir,
    envRemote: config.remote,
    tailscale,
  });
  app.decorate('access', access);
  registerSecurity(app, { allowedOrigins: config.allowedOrigins, access });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  const projects = new ProjectStore(path.join(config.dataDir, 'projects.json'));

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(cliRoutes, { clis: registry });
  await app.register(projectRoutes, { projects });
  await app.register(fsRoutes);
  await app.register(sessionRoutes, {
    sessions,
    clis: registry,
    projects,
    port: config.port,
    onRemoteSocket: (socket, login) => access.trackRemoteSocket(socket, login),
  });
  await app.register(remoteRoutes, { access });
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
