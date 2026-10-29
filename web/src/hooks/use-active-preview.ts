import { useMemo } from 'react';
import { resolvePreviewUrl } from '../lib/preview';
import { useAppStore } from '../stores/app-store';

/** The active session, its project, and the URL the preview pane should show for them. */
export function useActivePreview() {
  const active = useAppStore((s) => (s.activeId ? s.sessions[s.activeId] : undefined));
  const project = useAppStore((s) => s.projects.find((p) => p.id === active?.projectId));
  const sessions = useAppStore((s) => s.sessions);
  const resolved = useMemo(
    () => resolvePreviewUrl(active, project, Object.values(sessions)),
    [active, project, sessions],
  );
  return { active, project, resolved };
}
