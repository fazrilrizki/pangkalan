import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AccessControl } from '../remote/access-control';

declare module 'fastify' {
  interface FastifyRequest {
    /** Tailscale login of a request that came through `tailscale serve`; null for local ones. */
    remoteLogin: string | null;
  }
}

export interface SecurityOptions {
  /** Local origins; the remote origin comes from `access` while remote is on. */
  allowedOrigins: string[];
  access: AccessControl;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * A request counts as remote if anything about it says it came through a proxy. Local browsers
 * never send these headers, so a remote request can't slip past the identity check by looking local.
 */
function isRemoteRequest(request: FastifyRequest, remoteHost: string | undefined): boolean {
  return (
    (remoteHost !== undefined && request.headers.host === remoteHost) ||
    header(request, 'x-forwarded-host') !== undefined ||
    header(request, 'tailscale-user-login') !== undefined
  );
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

export function registerSecurity(
  app: FastifyInstance,
  { allowedOrigins, access }: SecurityOptions,
) {
  const allowedHosts = new Set(allowedOrigins.map((origin) => new URL(origin).host));
  const origins = new Set(allowedOrigins);
  const seenRemote = new Set<string>();

  app.decorateRequest('remoteLogin', null);

  app.addHook('onRequest', async (request, reply) => {
    // Read per request: remote access and the token can change from the panel while running.
    const remote = access.remote;
    const remoteHost = remote ? new URL(remote.origin).host : undefined;
    const token = access.token;

    if (isRemoteRequest(request, remoteHost)) {
      if (!remote || !remoteHost) return reply.code(403).send({ error: 'remote access disabled' });
      const forwardedHost = header(request, 'x-forwarded-host');
      if (forwardedHost !== undefined && forwardedHost !== remoteHost) {
        return reply.code(403).send({ error: 'forbidden host' });
      }
      // Set by `tailscale serve` for tailnet users; absent on Funnel (public) traffic.
      const login = header(request, 'tailscale-user-login');
      if (!login || !remote.users.includes(login)) {
        return reply.code(403).send({ error: 'forbidden user' });
      }
      // Hooks are called by local CLIs only; never let them be driven from the network.
      if (SELF_AUTHENTICATED_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      request.remoteLogin = login;
      const seenKey = `${login} ${request.ip}`;
      if (!seenRemote.has(seenKey)) {
        seenRemote.add(seenKey);
        request.log.info({ login, ip: request.ip }, 'remote access');
      }
    }

    // Rejecting unknown Host headers blocks DNS-rebinding attacks.
    const host = request.headers.host;
    if (!host || !(allowedHosts.has(host) || (remoteHost !== undefined && host === remoteHost))) {
      return reply.code(403).send({ error: 'forbidden host' });
    }

    const isApi = request.url.startsWith('/api/') || request.url.startsWith('/ws/');
    if (!isApi) return;

    // Blocks other websites in the same browser (cross-site WebSocket hijacking, CSRF).
    const origin = request.headers.origin;
    if (origin !== undefined && !origins.has(origin) && origin !== remote?.origin) {
      return reply.code(403).send({ error: 'forbidden origin' });
    }

    if (SELF_AUTHENTICATED_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;

    const provided = requestToken(request);
    if (!provided || !safeEqual(provided, token)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
}
