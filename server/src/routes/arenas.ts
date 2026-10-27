import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createArenaSchema } from '@integrasi/shared';
import type { ArenaManager } from '../arenas/arena-manager';
import { ArenaError } from '../arenas/arena-manager';
import { GitError } from '../arenas/git';

async function handle(reply: FastifyReply, action: () => Promise<unknown> | unknown, code = 200) {
  try {
    const result = await action();
    return result === undefined ? reply.code(204).send() : reply.code(code).send(result);
  } catch (err) {
    if (err instanceof ArenaError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof GitError) return reply.code(409).send({ error: `git: ${err.message}` });
    throw err;
  }
}

const winnerSchema = z.object({ letter: z.string().min(1) });
const sizeSchema = z.object({
  cols: z.number().int().min(2).max(1000).optional(),
  rows: z.number().int().min(2).max(500).optional(),
});

type ArenaParams = { Params: { id: string } };
type EntryParams = { Params: { id: string; letter: string } };

export async function arenaRoutes(app: FastifyInstance, { arenas }: { arenas: ArenaManager }) {
  app.get('/api/arenas', async () => arenas.list());

  app.get<ArenaParams>('/api/projects/:id/git', async (request, reply) =>
    handle(reply, () => arenas.projectGit(request.params.id)),
  );

  app.post('/api/arenas', async (request, reply) => {
    const parsed = createArenaSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    return handle(reply, () => arenas.create(parsed.data), 201);
  });

  app.get<ArenaParams>('/api/arenas/:id/diff', async (request, reply) =>
    handle(reply, () => arenas.diff(request.params.id)),
  );

  app.post<ArenaParams>('/api/arenas/:id/winner', async (request, reply) => {
    const parsed = winnerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    return handle(reply, () => arenas.pickWinner(request.params.id, parsed.data.letter));
  });

  app.post<ArenaParams>('/api/arenas/:id/discard', async (request, reply) =>
    handle(reply, () => arenas.discard(request.params.id)),
  );

  app.delete<ArenaParams>('/api/arenas/:id', async (request, reply) =>
    handle(reply, () => arenas.remove(request.params.id)),
  );

  app.post<EntryParams>('/api/arenas/:id/entries/:letter/prompt', async (request, reply) =>
    handle(reply, () => arenas.sendPrompt(request.params.id, request.params.letter)),
  );

  app.post<EntryParams>('/api/arenas/:id/entries/:letter/reopen', async (request, reply) => {
    const parsed = sizeSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const { cols, rows } = parsed.data;
    return handle(
      reply,
      () => arenas.reopen(request.params.id, request.params.letter, cols, rows),
      201,
    );
  });
}
