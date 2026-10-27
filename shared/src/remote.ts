import { z } from 'zod';

export interface TailscaleInfo {
  installed: boolean;
  /** Logged in and connected to a tailnet. */
  running: boolean;
  /** e.g. laptop.tail1234.ts.net */
  dnsName: string | null;
  /** Tailscale login of this machine's owner, e.g. you@github. */
  login: string | null;
  /** HTTPS certificates are turned on for the tailnet; `tailscale serve` needs them. */
  httpsEnabled: boolean;
  /** `tailscale serve` currently proxies to this server. */
  serving: boolean;
}

export interface RemoteStatus {
  /** Settings can only be changed from the laptop itself. */
  viewer: 'local' | 'remote';
  enabled: boolean;
  /** `env` when PANGKALAN_REMOTE_* set the state at start; panel changes then last until restart. */
  source: 'env' | 'panel';
  origin: string | null;
  users: string[];
  /** Tokened URL to open on the phone; only sent to local viewers. */
  url: string | null;
  /** Only probed for local viewers. */
  tailscale: TailscaleInfo | null;
}

/** Tailscale logins look like `name@github` or `name@example.com`. */
export const remoteUserSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[^\s@,]+@[^\s@,]+$/, 'Login Tailscale berbentuk nama@provider');

export const updateRemoteUsersSchema = z.object({
  users: z.array(remoteUserSchema).min(1).max(20),
});
export type UpdateRemoteUsersInput = z.infer<typeof updateRemoteUsersSchema>;
