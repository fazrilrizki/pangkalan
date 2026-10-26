import { useEffect } from 'react';
import { shouldNotify, showWaitingNotification } from '../lib/notify';
import { useAppStore } from '../stores/app-store';

/** Raises a browser notification when a session the user is not watching starts waiting. */
export function useWaitingNotifications(enabled: boolean) {
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        for (const session of Object.values(state.sessions)) {
          const before = previous.sessions[session.id]?.status;
          if (
            !shouldNotify({
              previous: before,
              next: session.status,
              isActiveTab: state.activeId === session.id,
              documentFocused: document.hasFocus(),
              enabled,
            })
          ) {
            continue;
          }
          const project = state.projects.find((p) => p.id === session.projectId);
          showWaitingNotification(
            session.id,
            `${session.title} menunggu input`,
            project ? `Project: ${project.name}` : session.cwd,
            () => useAppStore.getState().setActive(session.id),
          );
        }
      }),
    [enabled],
  );
}
