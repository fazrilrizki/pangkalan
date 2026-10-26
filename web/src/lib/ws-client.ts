import type { ClientMessage, ServerMessage } from '@integrasi/shared';
import { WS_CLOSE_SESSION_NOT_FOUND } from '@integrasi/shared';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'gone';

export interface SessionSocketHandlers {
  onMessage: (message: ServerMessage) => void;
  onStateChange?: (state: ConnectionState) => void;
}

type SocketFactory = (url: string) => WebSocket;

const MAX_BACKOFF_MS = 5_000;

/** WebSocket to one session that reconnects with backoff until the session is gone or closed. */
export class SessionSocket {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  state: ConnectionState = 'connecting';

  constructor(
    private readonly url: () => string,
    private readonly handlers: SessionSocketHandlers,
    private readonly createSocket: SocketFactory = (u) => new WebSocket(u),
  ) {
    this.open();
  }

  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  dispose() {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  private open() {
    const socket = this.createSocket(this.url());
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.setState('open');
    };
    socket.onmessage = (event) => {
      try {
        this.handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // ignore frames that are not JSON
      }
    };
    socket.onclose = (event) => {
      if (this.disposed) return;
      if (event.code === WS_CLOSE_SESSION_NOT_FOUND) {
        this.setState('gone');
        return;
      }
      this.setState('reconnecting');
      const delay = Math.min(250 * 2 ** this.attempts, MAX_BACKOFF_MS);
      this.attempts += 1;
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }

  private setState(state: ConnectionState) {
    this.state = state;
    this.handlers.onStateChange?.(state);
  }
}
