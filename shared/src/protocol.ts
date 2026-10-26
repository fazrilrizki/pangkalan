import { z } from 'zod';

export const SESSION_STATUSES = ['working', 'waiting', 'idle', 'exited', 'error'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface SessionInfo {
  id: string;
  projectId: string | null;
  cliId: string | null;
  title: string;
  cwd: string;
  status: SessionStatus;
  exitCode: number | null;
  createdAt: string;
}

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('input'), data: z.string().max(64 * 1024) }),
  z.object({
    type: z.literal('resize'),
    cols: z.number().int().min(2).max(1000),
    rows: z.number().int().min(2).max(500),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: 'replay'; data: string }
  | { type: 'output'; data: string }
  | { type: 'status'; status: SessionStatus }
  | { type: 'exit'; code: number };

/** WebSocket close code sent when the requested session does not exist. */
export const WS_CLOSE_SESSION_NOT_FOUND = 4404;
