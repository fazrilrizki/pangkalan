import type { FastifyInstance, FastifyReply } from 'fastify';
import { createProjectSchema, updateProjectSchema } from '@integrasi/shared';
import type { ProjectStore } from '../projects/project-store';
import { ProjectError } from '../projects/project-store';

function handle(reply: FastifyReply, action: () => unknown, successCode = 200) {
  try {
    const result = action();
    return reply.code(successCode).send(result);
  } catch (err) {
    if (err instanceof ProjectError) return reply.code(err.status).send({ error: err.message });
    throw err;
  }
}

export async function projectRoutes(
  app: FastifyInstance,
  { projects }: { projects: ProjectStore },
) {
  app.get('/api/projects', async () => projects.list());

  app.post('/api/projects', async (request, reply) => {
    const parsed = createProjectSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'path wajib diisi' });
    return handle(reply, () => projects.create(parsed.data), 201);
  });

  app.patch<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const parsed = updateProjectSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    return handle(reply, () => projects.update(request.params.id, parsed.data));
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    return handle(reply, () => projects.remove(request.params.id), 204);
  });
}
