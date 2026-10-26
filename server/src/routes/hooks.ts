import type { FastifyInstance } from 'fastify';
import { safeEqual } from '../security/auth';
import { statusFromHook } from '../sessions/claude-hooks';
import type { SessionManager } from '../sessions/session-manager';

/**
 * Receives Claude Code HTTP hooks. Authenticated by a per-session secret instead of the app
 * token, so a CLI process never holds a credential to the rest of the API.
 */
export async function hookRoutes(app: FastifyInstance, { sessions }: { sessions: SessionManager }) {
  app.post<{ Params: { sessionId: string } }>(
    '/api/hooks/:sessionId',
    // Tool hooks carry the tool input, which can be a whole file being written.
    { bodyLimit: 32 * 1024 * 1024 },
    async (request, reply) => {
      const session = sessions.get(request.params.sessionId);
      const secret = request.headers['x-hook-secret'];
      if (!session) return reply.code(404).send({ error: 'not found' });
      if (
        typeof secret !== 'string' ||
        !session.hookSecret ||
        !safeEqual(secret, session.hookSecret)
      ) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      const status = statusFromHook(request.body);
      if (status) session.reportStatus(status);
      return reply.code(204).send();
    },
  );
}
