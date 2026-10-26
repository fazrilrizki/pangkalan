import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface SecurityOptions {
  token: string;
  allowedOrigins: string[];
}

/** Paths that authenticate with their own per-session secret instead of the app token. */
const SELF_AUTHENTICATED_PREFIXES = ['/api/hooks/'];

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Reuses the token stored in the data dir so bookmarked URLs keep working across restarts.
 * `INTEGRASI_TOKEN` overrides it (used by e2e tests).
 */
export function loadOrCreateToken(dataDir: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.INTEGRASI_TOKEN) return env.INTEGRASI_TOKEN;
  const file = path.join(dataDir, '.token');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;
  } catch {
    // missing or unreadable: create below
  }
  const token = generateToken();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, token, { mode: 0o600 });
  return token;
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requestToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  // Browsers cannot set headers on WebSocket upgrades, so WS carries the token in the query.
  if (request.url.startsWith('/ws/')) {
    const query = request.query as Record<string, unknown> | undefined;
    if (typeof query?.token === 'string') return query.token;
  }
  return undefined;
}

export function registerSecurity(app: FastifyInstance, { token, allowedOrigins }: SecurityOptions) {
  const allowedHosts = new Set(allowedOrigins.map((origin) => new URL(origin).host));
  const origins = new Set(allowedOrigins);

  app.addHook('onRequest', async (request, reply) => {
    // Rejecting unknown Host headers blocks DNS-rebinding attacks.
    if (!request.headers.host || !allowedHosts.has(request.headers.host)) {
      return reply.code(403).send({ error: 'forbidden host' });
    }

    const isApi = request.url.startsWith('/api/') || request.url.startsWith('/ws/');
    if (!isApi) return;

    // Blocks other websites in the same browser (cross-site WebSocket hijacking, CSRF).
    const origin = request.headers.origin;
    if (origin !== undefined && !origins.has(origin)) {
      return reply.code(403).send({ error: 'forbidden origin' });
    }

    if (SELF_AUTHENTICATED_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;

    const provided = requestToken(request);
    if (!provided || !safeEqual(provided, token)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
}
