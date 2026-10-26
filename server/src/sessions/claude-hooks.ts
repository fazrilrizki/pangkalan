import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LiveStatus } from './status-detector';

/** Claude Code hook events we subscribe to, and the status each one implies. */
const EVENT_STATUS: Record<string, LiveStatus | 'notification'> = {
  SessionStart: 'idle',
  UserPromptSubmit: 'working',
  PreToolUse: 'working',
  PostToolUse: 'working',
  PostToolUseFailure: 'working',
  Notification: 'notification',
  Stop: 'idle',
  StopFailure: 'idle',
};

/** Notification types that mean Claude is blocked on the user. */
const WAITING_NOTIFICATIONS = new Set([
  'permission_prompt',
  'idle_prompt',
  'elicitation_dialog',
  'elicitation_url_dialog',
  'agent_needs_input',
]);

export function statusFromHook(payload: unknown): LiveStatus | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { hook_event_name: event, notification_type: type } = payload as Record<string, unknown>;
  if (typeof event !== 'string') return null;
  const status = EVENT_STATUS[event];
  if (status === undefined) return null;
  if (status !== 'notification') return status;
  return typeof type === 'string' && WAITING_NOTIFICATIONS.has(type) ? 'waiting' : null;
}

export interface ClaudeHookSetup {
  secret: string;
  settingsFile: string;
  /** Extra CLI arguments that make Claude load the hook settings for this process only. */
  args: string[];
  cleanup: () => void;
}

/**
 * Writes a per-session settings file with HTTP hooks pointing back at this server and returns
 * the `--settings` arguments. Hooks from `--settings` are merged with the user's own hooks, and
 * the user's settings files are never modified.
 */
export function prepareClaudeHooks(sessionId: string, port: number): ClaudeHookSetup {
  const secret = randomBytes(24).toString('hex');
  const dir = path.join(os.tmpdir(), 'integrasi-ai');
  fs.mkdirSync(dir, { recursive: true });
  const settingsFile = path.join(dir, `claude-hooks-${sessionId}.json`);

  const handler = {
    type: 'http',
    url: `http://127.0.0.1:${port}/api/hooks/${sessionId}`,
    headers: { 'x-hook-secret': secret },
    timeout: 5,
  };
  const hooks = Object.fromEntries(
    Object.keys(EVENT_STATUS).map((event) => [event, [{ hooks: [handler] }]]),
  );
  fs.writeFileSync(settingsFile, JSON.stringify({ hooks }, null, 2), { mode: 0o600 });

  return {
    secret,
    settingsFile,
    args: ['--settings', settingsFile],
    cleanup: () => fs.rmSync(settingsFile, { force: true }),
  };
}
