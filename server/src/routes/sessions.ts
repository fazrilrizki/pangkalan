import fs from 'node:fs';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { WS_CLOSE_SESSION_NOT_FOUND, clientMessageSchema } from '@integrasi/shared';
import type { CliRegistry } from '../clis/cli-registry';
import type { ProjectStore } from '../projects/project-store';
import { LaunchError, launchSession } from '../sessions/launch';
import type { SessionManager } from '../sessions/session-manager';

// The command to run is never taken from the request: only a cliId that maps to the config file.
const createSessionSchema = z.object({
  cliId: z.string().optional(),
  /** When set, the session runs in the project's folder and `cwd` is ignored. */
  projectId: z.string().optional(),
  cwd: z.string().min(1).optional(),
  cols: z.number().int().min(2).max(1000).optional(),
  rows: z.number().int().min(2).max(500).optional(),
});

export interface SessionRoutesOptions {
  sessions: SessionManager;
  clis: CliRegistry;
  projects: ProjectStore;
  /** Port hooks call back on. */
  port: number;
  /** Lets remote terminals be closed when their access is revoked. */
  onRemoteSocket?: (socket: WebSocket, login: string) => void;
}

export async function sessionRoutes(
  app: FastifyInstance,
  { sessions, clis, projects, port, onRemoteSocket }: SessionRoutesOptions,
) {
  app.get('/api/sessions', async () => sessions.list());

  app.post('/api/sessions', async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const { cliId, projectId, cols, rows } = parsed.data;

    let cwd = parsed.data.cwd ?? os.homedir();
    if (projectId !== undefined) {
      const project = projects.get(projectId);
      if (!project) return reply.code(400).send({ error: 'Project tidak ditemukan' });
      cwd = project.path;
    }

    if (!fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
      return reply.code(400).send({ error: 'cwd is not a directory' });
    }

    try {
      const session = launchSession(
        { sessions, clis, port },
        { cwd, cliId: cliId ?? null, projectId: projectId ?? null, cols, rows },
      );
      return reply.code(201).send(session.info());
    } catch (err) {
      if (err instanceof LaunchError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    if (!sessions.remove(request.params.id)) return reply.code(404).send({ error: 'not found' });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>(
    '/ws/sessions/:id',
    { websocket: true },
    (socket, request) => {
      const session = sessions.get(request.params.id);
      if (!session) {
        socket.close(WS_CLOSE_SESSION_NOT_FOUND, 'session not found');
        return;
      }
      if (request.remoteLogin !== null) onRemoteSocket?.(socket, request.remoteLogin);

      const detach = session.attach((message) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      });

      socket.on('message', (raw) => {
        let json: unknown;
        try {
          json = JSON.parse(raw.toString());
        } catch {
          return;
        }
        const parsed = clientMessageSchema.safeParse(json);
        if (!parsed.success) return;
        const message = parsed.data;
        try {
          if (message.type === 'input') session.write(message.data);
          else session.resize(message.cols, message.rows);
        } catch (err) {
          // One misbehaving session must never take the server (and every other session) down.
          request.log.warn({ err, sessionId: session.id }, 'terminal message failed');
        }
      });

      socket.on('close', detach);
    },
  );
}
