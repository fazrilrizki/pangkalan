import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerMessage, SessionInfo } from '@integrasi/shared';
import { SessionManager } from '../src/sessions/session-manager';
import { StatusTracker, detectStatus, stripAnsi } from '../src/sessions/status-detector';
import { startTestServer, waitFor } from './helpers';

describe('detectStatus', () => {
  const base = { waitingPatterns: [/\(y\/n\)\s*$/], idleAfterMs: 1000 };

  it('is working while output is recent', () => {
    expect(detectStatus({ ...base, msSinceLastActivity: 200, outputSinceInput: '(y/n)' })).toBe(
      'working',
    );
  });

  it('is waiting when quiet and the output matches a prompt pattern', () => {
    expect(
      detectStatus({
        ...base,
        msSinceLastActivity: 2000,
        outputSinceInput: '\x1b[33mContinue? (y/n) \x1b[0m',
      }),
    ).toBe('waiting');
  });

  it('is idle when quiet without a prompt', () => {
    expect(detectStatus({ ...base, msSinceLastActivity: 2000, outputSinceInput: 'done\r\n' })).toBe(
      'idle',
    );
  });
});

describe('stripAnsi', () => {
  it('removes CSI and OSC sequences', () => {
    expect(stripAnsi('\x1b[1;32mok\x1b[0m \x1b]0;title\x07end')).toBe('ok end');
  });
});

describe('StatusTracker', () => {
  function setup() {
    let now = 0;
    const tracker = new StatusTracker({
      waitingPatterns: [/\(y\/n\)\s*$/],
      idleAfterMs: 1000,
      hookWorkingSilenceMs: 5000,
      now: () => now,
    });
    return { tracker, advance: (ms: number) => (now += ms) };
  }

  it('ignores small echoes right after a keystroke', () => {
    const { tracker, advance } = setup();
    advance(5000);
    tracker.onInput();
    advance(20);
    tracker.onOutput('l');
    expect(tracker.current()).toBe('idle');
    advance(500);
    tracker.onOutput('real output from the command');
    expect(tracker.current()).toBe('working');
  });

  it('forgets prompt text once the user answers', () => {
    const { tracker, advance } = setup();
    tracker.onOutput('Continue? (y/n) ');
    advance(2000);
    expect(tracker.current()).toBe('waiting');
    tracker.onInput();
    advance(2000);
    expect(tracker.current()).toBe('idle');
  });

  it('lets hook signals override the heuristic', () => {
    const { tracker, advance } = setup();
    advance(3000);
    expect(tracker.current()).toBe('idle');
    tracker.onHook('waiting');
    expect(tracker.current()).toBe('waiting');
    tracker.onHook('idle');
    tracker.onOutput('spinner');
    expect(tracker.current()).toBe('idle');
  });

  it('drops a hook "working" signal after a long silence (interrupt fires no hook)', () => {
    const { tracker, advance } = setup();
    tracker.onHook('working');
    advance(4000);
    expect(tracker.current()).toBe('working');
    advance(2000);
    expect(tracker.current()).toBe('idle');
  });

  it('drops a hook "waiting" signal once the user types', () => {
    const { tracker, advance } = setup();
    tracker.onHook('waiting');
    advance(10);
    tracker.onInput();
    advance(2000);
    expect(tracker.current()).toBe('idle');
  });
});

describe('status over the WebSocket with a fake CLI', () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;

  beforeAll(async () => {
    const sessions = new SessionManager({ statusIntervalMs: 50, status: { idleAfterMs: 400 } });
    server = await startTestServer(43105, { sessions });
  });
  afterAll(() => server.app.close());

  const statuses = (messages: ServerMessage[]) =>
    messages.flatMap((m) => (m.type === 'status' ? [m.status] : []));

  it('moves through idle, working, and waiting, sending only changes', async () => {
    const res = await server.api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cliId: 'fake', cwd: process.cwd() }),
    });
    const info = (await res.json()) as SessionInfo;
    const client = await server.connect(info.id);

    await waitFor(() => client.output().includes('fake-cli ready'));
    await waitFor(() => statuses(client.messages).at(-1) === 'idle');

    client.send({ type: 'input', data: 'spam\r' });
    await waitFor(() => statuses(client.messages).at(-1) === 'working');
    await waitFor(() => statuses(client.messages).at(-1) === 'idle', 5000);

    client.send({ type: 'input', data: 'ask\r' });
    await waitFor(() => statuses(client.messages).at(-1) === 'waiting');

    const list = (await (await server.api('/api/sessions')).json()) as SessionInfo[];
    expect(list.find((s) => s.id === info.id)?.status).toBe('waiting');

    const seq = statuses(client.messages);
    expect(seq.every((s, i) => i === 0 || s !== seq[i - 1])).toBe(true);
    client.ws.close();
  });
});
