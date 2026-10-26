import { useEffect } from 'react';
import { matchShortcut } from '../lib/shortcuts';
import { useAppStore } from '../stores/app-store';

/** Global keyboard shortcuts (see lib/shortcuts for why they use Ctrl+Alt). */
export function useShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const action = matchShortcut(e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation(); // keep the keystroke out of the terminal
      const store = useAppStore.getState();
      switch (action.type) {
        case 'new':
          void store.duplicateActive().catch((err: unknown) => store.setError(String(err)));
          break;
        case 'close':
          if (store.activeId) store.requestClose(store.activeId);
          break;
        case 'cycle':
          store.cycleActive(action.step);
          break;
        case 'jump': {
          const id = store.order[action.index];
          if (id) store.setActive(id);
          break;
        }
      }
    }
    // Capture phase so the shortcut wins even while the terminal has focus.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}

/** Puts the number of sessions waiting for input in the browser tab title. */
export function useWaitingTitle() {
  const waiting = useAppStore(
    (s) => Object.values(s.sessions).filter((session) => session.status === 'waiting').length,
  );
  useEffect(() => {
    document.title = waiting > 0 ? `(${waiting}) menunggu · Integrasi AI` : 'Integrasi AI';
  }, [waiting]);
}
