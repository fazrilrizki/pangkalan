import type { SessionStatus } from '@integrasi/shared';

const ENABLED_KEY = 'integrasi.notify';

export function shouldNotify(input: {
  previous: SessionStatus | undefined;
  next: SessionStatus;
  isActiveTab: boolean;
  documentFocused: boolean;
  enabled: boolean;
}): boolean {
  if (!input.enabled || input.next !== 'waiting' || input.previous === 'waiting') return false;
  // Only interrupt for sessions the user is not looking at right now.
  return !input.isActiveTab || !input.documentFocused;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? 'on' : 'off');
  } catch {
    // per-viewer convenience only
  }
}

export function showWaitingNotification(
  sessionId: string,
  title: string,
  body: string,
  onClick: () => void,
) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    // `tag` collapses repeated notifications for the same session into one.
    const notification = new Notification(title, { body, tag: `waiting-${sessionId}` });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    // some browsers throw outside a secure context; the app keeps working without it
  }
}
