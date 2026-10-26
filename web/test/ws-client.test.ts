import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@integrasi/shared';
import { WS_CLOSE_SESSION_NOT_FOUND } from '@integrasi/shared';
import type { ConnectionState } from '../src/lib/ws-client';
import { SessionSocket } from '../src/lib/ws-client';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState: number = WebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = WebSocket.CLOSED;
  }
  serverOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }
  serverSend(message: ServerMessage | string) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  serverClose(code: number) {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

function setup() {
  const messages: ServerMessage[] = [];
  const states: ConnectionState[] = [];
  const socket = new SessionSocket(
    () => 'ws://test/ws/sessions/1',
    { onMessage: (m) => messages.push(m), onStateChange: (s) => states.push(s) },
    (url) => new FakeSocket(url) as unknown as WebSocket,
  );
  return { socket, messages, states, current: () => FakeSocket.instances.at(-1)! };
}

describe('SessionSocket', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('parses server messages and ignores non-JSON frames', () => {
    const { messages, current } = setup();
    current().serverOpen();
    current().serverSend({ type: 'output', data: 'hi' });
    current().serverSend('garbage');
    expect(messages).toEqual([{ type: 'output', data: 'hi' }]);
  });

  it('only sends while open', () => {
    const { socket, current } = setup();
    socket.send({ type: 'input', data: 'early' });
    current().serverOpen();
    socket.send({ type: 'input', data: 'late' });
    expect(current().sent).toEqual([JSON.stringify({ type: 'input', data: 'late' })]);
  });

  it('reconnects with backoff after an unexpected close', () => {
    const { states, current } = setup();
    current().serverOpen();
    current().serverClose(1006);
    expect(states.at(-1)).toBe('reconnecting');
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(FakeSocket.instances).toHaveLength(2);
    current().serverOpen();
    expect(states.at(-1)).toBe('open');
  });

  it('stops when the session is gone', () => {
    const { states, current } = setup();
    current().serverClose(WS_CLOSE_SESSION_NOT_FOUND);
    vi.advanceTimersByTime(10_000);
    expect(states.at(-1)).toBe('gone');
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('does not reconnect after dispose', () => {
    const { socket, current } = setup();
    current().serverOpen();
    socket.dispose();
    current().serverClose(1000);
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
