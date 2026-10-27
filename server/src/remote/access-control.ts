import fs from 'node:fs';
import path from 'node:path';
import type { RemoteStatus } from '@integrasi/shared';
import type { RemoteConfig } from '../config';
import { parseRemoteOrigin } from '../config';
import { generateToken } from '../security/auth';
import type { Tailscale } from './tailscale';

export class RemoteError extends Error {
  constructor(
    readonly status: 409 | 502,
    message: string,
  ) {
    super(message);
  }
}

/** Kept while remote is off so the allowlist survives a disable/enable round trip. */
interface StoredRemote {
  enabled: boolean;
  origin: string | null;
  users: string[];
}

interface RemoteSocket {
  close(code: number, reason: string): void;
  once(event: 'close', listener: () => void): unknown;
}

/** Policy violation: the socket's access was revoked. */
const WS_CLOSE_REVOKED = 1008;

export interface AccessControlOptions {
  token: string;
  dataDir: string;
  /** From PANGKALAN_REMOTE_*; takes precedence over data/remote.json at start. */
  envRemote: RemoteConfig | null;
  tailscale: Tailscale;
}

/**
 * The parts of the security policy that can change while the server runs: the app token and
 * remote access. Turning remote off, revoking the token, or dropping a user also closes the
 * terminals that remote users already have open, since a WebSocket is only checked at upgrade.
 */
export class AccessControl {
  private currentToken: string;
  private stored: StoredRemote;
  readonly source: 'env' | 'panel';
  private readonly file: string;
  private readonly sockets = new Map<RemoteSocket, string>();

  constructor(private readonly options: AccessControlOptions) {
    this.currentToken = options.token;
    this.file = path.join(options.dataDir, 'remote.json');
    this.source = options.envRemote ? 'env' : 'panel';
    this.stored = options.envRemote ? { enabled: true, ...options.envRemote } : this.read();
  }

  get token(): string {
    return this.currentToken;
  }

  get remote(): RemoteConfig | null {
    const { enabled, origin, users } = this.stored;
    return enabled && origin && users.length > 0 ? { origin, users } : null;
  }

  trackRemoteSocket(socket: RemoteSocket, login: string) {
    this.sockets.set(socket, login);
    socket.once('close', () => this.sockets.delete(socket));
  }

  async status(viewer: 'local' | 'remote'): Promise<RemoteStatus> {
    const remote = this.remote;
    const local = viewer === 'local';
    return {
      viewer,
      enabled: remote !== null,
      source: this.source,
      origin: this.stored.origin,
      users: [...this.stored.users],
      url: local && remote ? `${remote.origin}/?token=${this.currentToken}` : null,
      tailscale: local ? await this.options.tailscale.info() : null,
    };
  }

  async enable(): Promise<void> {
    const info = await this.options.tailscale.info();
    if (!info.installed) throw new RemoteError(409, 'Tailscale belum terpasang di laptop ini');
    if (!info.running || !info.dnsName) {
      throw new RemoteError(409, 'Tailscale belum login atau belum tersambung');
    }
    if (!info.httpsEnabled) {
      throw new RemoteError(409, 'HTTPS Certificates belum dinyalakan di admin console Tailscale');
    }
    const origin = parseRemoteOrigin(`https://${info.dnsName}`);
    const users = this.stored.users.length > 0 ? this.stored.users : info.login ? [info.login] : [];
    if (users.length === 0) throw new RemoteError(409, 'Login Tailscale tidak terbaca');
    try {
      await this.options.tailscale.serve();
    } catch (err) {
      throw new RemoteError(502, `tailscale serve gagal: ${(err as Error).message}`);
    }
    this.save({ enabled: true, origin, users });
  }

  /** Access is cut before stopping `tailscale serve`, so a failure there never leaves it open. */
  async disable(): Promise<void> {
    this.save({ ...this.stored, enabled: false });
    this.closeSockets(() => true);
    try {
      await this.options.tailscale.unserve();
    } catch (err) {
      throw new RemoteError(
        502,
        `Akses remote sudah dimatikan, tapi tailscale serve gagal dihentikan: ${(err as Error).message}`,
      );
    }
  }

  setUsers(users: string[]) {
    const unique = [...new Set(users)];
    this.save({ ...this.stored, users: unique });
    this.closeSockets((login) => !unique.includes(login));
  }

  /** Every device, phone and laptop alike, needs the new token afterwards. */
  rotateToken(): string {
    this.currentToken = generateToken();
    fs.mkdirSync(this.options.dataDir, { recursive: true });
    fs.writeFileSync(path.join(this.options.dataDir, '.token'), this.currentToken, { mode: 0o600 });
    this.closeSockets(() => true);
    return this.currentToken;
  }

  private closeSockets(shouldClose: (login: string) => boolean) {
    for (const [socket, login] of this.sockets) {
      if (!shouldClose(login)) continue;
      this.sockets.delete(socket);
      socket.close(WS_CLOSE_REVOKED, 'remote access revoked');
    }
  }

  private read(): StoredRemote {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<StoredRemote>;
      const users = Array.isArray(raw.users) ? raw.users.filter((u) => typeof u === 'string') : [];
      const origin = typeof raw.origin === 'string' ? parseRemoteOrigin(raw.origin) : null;
      return { enabled: raw.enabled === true, origin, users };
    } catch {
      // missing or malformed: remote stays off
      return { enabled: false, origin: null, users: [] };
    }
  }

  private save(next: StoredRemote) {
    this.stored = next;
    fs.mkdirSync(this.options.dataDir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2));
  }
}
