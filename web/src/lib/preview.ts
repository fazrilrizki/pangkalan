import type { Project, SessionInfo } from '@integrasi/shared';

export type PreviewSource = 'manual' | 'session' | 'project';

export interface ResolvedPreview {
  url: string;
  source: PreviewSource;
}

/**
 * Which URL the preview pane shows for the active session: a URL set by hand on the project
 * wins; otherwise the dev server this session printed (arena contestants each run their own);
 * otherwise the newest one printed by another session of the same project, e.g. `npm run dev`
 * in a shell tab next to the agent.
 */
export function resolvePreviewUrl(
  active: SessionInfo | undefined,
  project: Project | undefined,
  sessions: SessionInfo[],
): ResolvedPreview | null {
  if (project?.previewUrl) return { url: project.previewUrl, source: 'manual' };
  if (!active) return null;
  if (active.previewUrl) return { url: active.previewUrl, source: 'session' };
  if (!active.projectId) return null;
  const newest = sessions
    .filter((s) => s.projectId === active.projectId && s.previewUrl && s.previewDetectedAt)
    .sort((a, b) => b.previewDetectedAt!.localeCompare(a.previewDetectedAt!))[0];
  return newest ? { url: newest.previewUrl!, source: 'project' } : null;
}

/**
 * The preview loads the dev server straight from the browser, so it only works when the
 * browser runs on the same machine; through Tailscale `localhost` would be the phone.
 */
export function isLocalHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
}

/**
 * Whether the browser treats the preview as a third party of Pangkalan's page. Its `SameSite=Lax`
 * cookies are then neither stored nor sent inside the iframe, so logging in to, say, a Herd site
 * (`http://app.test`) ends in Laravel's "419 Page Expired". Ports do not matter for cookies, so
 * `http://127.0.0.1:8000` next to Pangkalan on `127.0.0.1` keeps its session.
 */
export function isCrossSitePreview(url: string, page: { protocol: string; hostname: string }) {
  try {
    const target = new URL(url);
    return target.protocol !== page.protocol || target.hostname !== page.hostname;
  } catch {
    return false;
  }
}
