import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WS_CLOSE_SESSION_NOT_FOUND, clientMessageSchema } from '@integrasi/shared';
import type { CliRegistry } from '../clis/cli-registry';
import { cliLaunchArgs } from '../clis/cli-registry';
import type { ProjectStore } from '../projects/project-store';
import type { ClaudeHookSetup } from '../sessions/claude-hooks';
import { prepareClaudeHooks } from '../sessions/claude-hooks';
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
}

export async function sessionRoutes(
  app: FastifyInstance,
  { sessions, clis, projects, port }: SessionRoutesOptions,
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

    const id = randomUUID();
    const shell = clis.shell;
    let args = shell.args;
    let hooks: ClaudeHookSetup | undefined;
    let title = 'Shell';
    let waitingPatterns: RegExp[] = [];
    if (cliId !== undefined) {
      const cli = clis.get(cliId);
      if (!cli) return reply.code(400).send({ error: `unknown cli "${cliId}"` });
      if (!cli.enabled) return reply.code(400).send({ error: `cli "${cliId}" is disabled` });
      if (cli.statusMode === 'hooks') hooks = prepareClaudeHooks(id, port);
      args = cliLaunchArgs(shell, cli, hooks?.args);
      title = cli.name;
      waitingPatterns = cli.waitingPatterns.map((p) => new RegExp(p));
    }

    const session = sessions.create({
      id,
      file: shell.file,
      args,
      cwd,
      cols,
      rows,
      projectId: projectId ?? null,
      cliId: cliId ?? null,
      title,
      waitingPatterns,
      hookSecret: hooks?.secret,
      cleanup: hooks?.cleanup,
    });
    return reply.code(201).send(session.info());
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
        if (message.type === 'input') session.write(message.data);
        else session.resize(message.cols, message.rows);
      });

      socket.on('close', detach);
    },
  );
}
