import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { updateRemoteUsersSchema } from '@integrasi/shared';
import type { AccessControl } from '../remote/access-control';
import { RemoteError } from '../remote/access-control';

async function handle(reply: FastifyReply, action: () => Promise<unknown> | unknown) {
  try {
    const result = await action();
    return result === undefined ? reply.code(204).send() : reply.send(result);
  } catch (err) {
    if (err instanceof RemoteError) return reply.code(err.status).send({ error: err.message });
    throw err;
  }
}

/** Anyone who reaches the panel from the phone could otherwise widen their own access. */
function localOnly(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.remoteLogin === null) return true;
  void reply.code(403).send({ error: 'Pengaturan akses hanya bisa diubah dari laptop' });
  return false;
}

export async function remoteRoutes(app: FastifyInstance, { access }: { access: AccessControl }) {
  app.get('/api/remote', async (request) =>
    access.status(request.remoteLogin === null ? 'local' : 'remote'),
  );

  app.post('/api/remote/enable', async (request, reply) => {
    if (!localOnly(request, reply)) return reply;
    return handle(reply, async () => {
      await access.enable();
      return access.status('local');
    });
  });

  app.post('/api/remote/disable', async (request, reply) => {
    if (!localOnly(request, reply)) return reply;
    return handle(reply, async () => {
      await access.disable();
      return access.status('local');
    });
  });

  app.put('/api/remote/users', async (request, reply) => {
    if (!localOnly(request, reply)) return reply;
    const parsed = updateRemoteUsersSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid body' });
    }
    return handle(reply, async () => {
      access.setUsers(parsed.data.users);
      return access.status('local');
    });
  });

  app.post('/api/remote/rotate-token', async (request, reply) => {
    if (!localOnly(request, reply)) return reply;
    return handle(reply, () => ({ token: access.rotateToken() }));
  });
}
