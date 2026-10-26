import type { FastifyInstance } from 'fastify';
import type { CliRegistry } from '../clis/cli-registry';

export async function cliRoutes(app: FastifyInstance, { clis }: { clis: CliRegistry }) {
  app.get('/api/clis', async () => ({ clis: clis.list(), errors: clis.errors }));
}
