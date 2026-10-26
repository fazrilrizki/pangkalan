import fs from 'node:fs';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WS_CLOSE_SESSION_NOT_FOUND, clientMessageSchema } from '@integrasi/shared';
import type { SessionManager } from '../sessions/session-manager';

const createSessionSchema = z.object({
  cwd: z
    .string()
    .min(1)
    .default(() => os.homedir()),
  cols: z.number().int().min(2).max(1000).optional(),
  rows: z.number().int().min(2).max(500).optional(),
});

export interface SessionRoutesOptions {
  sessions: SessionManager;
  shell: { file: string; args: string[] };
}

export async function sessionRoutes(
  app: FastifyInstance,
  { sessions, shell }: SessionRoutesOptions,
) {
  app.get('/api/sessions', async () => sessions.list());

  app.post('/api/sessions', async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const { cwd, cols, rows } = parsed.data;
    if (!fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
      return reply.code(400).send({ error: 'cwd is not a directory' });
    }
    const session = sessions.create({
      file: shell.file,
      args: shell.args,
      cwd,
      cols,
      rows,
      projectId: null,
      cliId: null,
      title: 'Shell',
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
